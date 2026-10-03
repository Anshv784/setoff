// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title Setoff — multilateral netting clearinghouse for stablecoin obligations
/// @notice Debtors sign IOUs, anyone posts them, and any solver can clear a cycle.
///         A cycle settles a set of IOUs at once: every party's obligations are
///         netted, net debtors are debited from their deposit, net creditors are
///         credited. Only the net amounts are funded; gross obligations never move.
///
///         Three extensions, each keeping "nobody is left unpaid without agreeing":
///         - Partial payments: a cycle may pay part of an IOU; the rest stays open.
///         - Disputes: either party can freeze an open IOU; it only moves again when
///           both parties propose the same new amount (0 cancels it).
///         - Credit lines: a lender lets a borrower overdraw up to a limit. Draws come
///           out of the lender's own deposit and are recorded as owed back to them.
/// @dev Settlement is a pure ledger update with no token transfers, so one
///      blocklisted or misbehaving address cannot revert a cycle for everyone.
///      Tokens only move on deposit and withdraw.
contract Setoff is EIP712 {
    using SafeERC20 for IERC20;

    struct IOU {
        address debtor;
        address creditor;
        address token;
        uint128 amount;
        uint64 deadline; // last timestamp at which the IOU may be settled
        uint256 nonce; // debtor-chosen, makes otherwise identical IOUs distinct
        bytes32 ref; // invoice / reference id, carried through to settlement events
    }

    enum Status {
        None,
        Pending,
        Settled,
        Cancelled,
        Disputed
    }

    struct Record {
        IOU iou; // iou.amount is the current face value (a resolved dispute can lower it)
        Status status;
        uint64 cycle; // last cycle that paid any of it
        uint128 paid; // total paid so far, across cycles
        uint128 debtorOffer; // dispute proposals, stored as amount + 1 (0 = none)
        uint128 creditorOffer;
    }

    /// @notice A credit draw used in a cycle: `lender` funds `amount` of `borrower`'s shortfall.
    struct Draw {
        address borrower;
        address lender;
        address token;
        uint128 amount;
    }

    /// @notice A currency swap between opted-in parties inside a cycle: `account` gives up
    ///         `sellAmount` of its net position in `sell` for `buyAmount` of `buy`.
    struct Conversion {
        address account;
        address sell;
        address buy;
        uint128 sellAmount;
        uint128 buyAmount;
    }

    struct CreditLine {
        uint128 limit;
        uint128 used; // drawn and not yet repaid
    }

    bytes32 public constant IOU_TYPEHASH = keccak256(
        "IOU(address debtor,address creditor,address token,uint128 amount,uint64 deadline,uint256 nonce,bytes32 ref)"
    );
    uint256 public constant MAX_IOUS_PER_CYCLE = 256;

    /// @notice Settlement tokens, fixed at deployment (USDC, EURC).
    address[] internal _tokens;

    mapping(address account => mapping(address token => uint256)) public balanceOf;
    mapping(bytes32 id => Record) internal _records;
    mapping(address lender => mapping(address borrower => mapping(address token => CreditLine))) public creditLine;
    /// @notice Minimum rate an account accepts to convert `sell` into `buy`, as buy units
    ///         per 1 sell unit scaled by 1e6 (e.g. 1.07e6 = 1.07 USDC per EURC). 0 = never.
    mapping(address account => mapping(address sell => mapping(address buy => uint64))) public fxMinRate;
    uint64 public cycleCount;

    event Deposited(address indexed account, address indexed token, uint256 amount);
    event Withdrawn(address indexed account, address indexed token, uint256 amount);
    event IOUSubmitted(
        bytes32 indexed id,
        address indexed debtor,
        address indexed creditor,
        address token,
        uint128 amount,
        uint64 deadline,
        uint256 nonce,
        bytes32 ref
    );
    event IOUCancelled(bytes32 indexed id, address indexed by);
    /// @param amount paid in this cycle; @param remaining still owed after it (0 = fully settled)
    event IOUSettled(
        bytes32 indexed id,
        uint64 indexed cycle,
        address indexed debtor,
        address creditor,
        address token,
        uint128 amount,
        uint128 remaining,
        bytes32 ref
    );
    event IOUDisputed(bytes32 indexed id, address indexed by);
    event IOUOffer(bytes32 indexed id, address indexed by, uint128 amount);
    /// @param remaining the agreed amount still owed (0 = cancelled by agreement)
    event IOUResolved(bytes32 indexed id, uint128 remaining);
    event NetPosition(uint64 indexed cycle, address indexed account, address indexed token, int256 net);
    /// @param gross total face value paid in this cycle, per token (same order as tokens())
    /// @param netFunded total debited from net debtors, per token — the liquidity actually used
    event CycleSettled(
        uint64 indexed cycle, address indexed solver, uint256 iouCount, uint256[] gross, uint256[] netFunded
    );
    event CreditLineSet(address indexed lender, address indexed borrower, address indexed token, uint128 limit);
    event CreditDrawn(
        uint64 indexed cycle, address indexed borrower, address indexed lender, address token, uint128 amount
    );
    event FxPreferenceSet(address indexed account, address indexed sell, address indexed buy, uint64 minRate);
    event Converted(
        uint64 indexed cycle, address indexed account, address sell, uint128 sellAmount, address buy, uint128 buyAmount
    );
    event CreditRepaid(address indexed borrower, address indexed lender, address indexed token, uint128 amount);

    error UnsupportedToken(address token);
    error ZeroAmount();
    error SelfIOU();
    error Expired(bytes32 id);
    error AlreadySubmitted(bytes32 id);
    error BadSignature();
    error NotPending(bytes32 id);
    error NotDisputed(bytes32 id);
    error NotParty();
    error EmptyCycle();
    error CycleTooLarge();
    error LengthMismatch();
    error PartiesNotSorted();
    error PartyMissing(address account);
    error OverPayment(bytes32 id, uint128 amount, uint128 remaining);
    error InsufficientDeposit(address account, address token, uint256 needed, uint256 available);
    error InsufficientBalance();
    error OverCredit(address lender, address borrower, uint128 amount, uint128 available);
    error OverRepay();
    error FxNotAllowed(address account, address sell, address buy);
    error FxRateTooLow(address account, uint256 rate, uint256 minRate);
    error FxUnbalanced(address token);
    error FxExceedsNet(address account);

    constructor(address[] memory tokens_) EIP712("Setoff", "1") {
        for (uint256 i; i < tokens_.length; ++i) {
            if (tokens_[i] == address(0) || _tokenIndex(tokens_[i]) != type(uint256).max) {
                revert UnsupportedToken(tokens_[i]);
            }
            _tokens.push(tokens_[i]);
        }
    }

    // ------------------------------------------------------------------ deposits

    function deposit(address token, uint256 amount) external {
        _requireToken(token);
        if (amount == 0) revert ZeroAmount();
        balanceOf[msg.sender][token] += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external {
        uint256 bal = balanceOf[msg.sender][token];
        if (amount == 0) revert ZeroAmount();
        if (amount > bal) revert InsufficientBalance();
        balanceOf[msg.sender][token] = bal - amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    // ---------------------------------------------------------------------- IOUs

    /// @notice Post an IOU to the public pool. Anyone may submit a debtor-signed IOU;
    ///         the debtor may submit their own with an empty signature.
    function submit(IOU calldata iou, bytes calldata signature) external returns (bytes32 id) {
        _requireToken(iou.token);
        if (iou.amount == 0) revert ZeroAmount();
        if (iou.debtor == iou.creditor) revert SelfIOU();
        id = hashIOU(iou);
        if (block.timestamp > iou.deadline) revert Expired(id);
        if (_records[id].status != Status.None) revert AlreadySubmitted(id);
        if (msg.sender != iou.debtor && !SignatureChecker.isValidSignatureNow(iou.debtor, id, signature)) {
            revert BadSignature();
        }
        Record storage r = _records[id];
        r.iou = iou;
        r.status = Status.Pending;
        emit IOUSubmitted(id, iou.debtor, iou.creditor, iou.token, iou.amount, iou.deadline, iou.nonce, iou.ref);
    }

    /// @notice Debtor withdraws, or creditor rejects/forgives, an open or disputed IOU.
    ///         Anything already paid stays paid.
    function cancel(bytes32 id) external {
        Record storage r = _records[id];
        if (r.status != Status.Pending && r.status != Status.Disputed) revert NotPending(id);
        _requireParty(r);
        r.status = Status.Cancelled;
        emit IOUCancelled(id, msg.sender);
    }

    // ------------------------------------------------------------------ disputes

    /// @notice Freeze an open IOU so no cycle can pay it while the parties sort it out.
    function dispute(bytes32 id) external {
        Record storage r = _records[id];
        if (r.status != Status.Pending) revert NotPending(id);
        _requireParty(r);
        r.status = Status.Disputed;
        emit IOUDisputed(id, msg.sender);
    }

    /// @notice Propose what is still owed on a disputed IOU. When both parties have
    ///         proposed the same amount, the IOU reopens at that amount (0 cancels it).
    function offer(bytes32 id, uint128 remaining) external {
        Record storage r = _records[id];
        if (r.status != Status.Disputed) revert NotDisputed(id);
        uint128 open = r.iou.amount - r.paid;
        if (remaining > open) revert OverPayment(id, remaining, open);
        if (msg.sender == r.iou.debtor) r.debtorOffer = remaining + 1;
        else if (msg.sender == r.iou.creditor) r.creditorOffer = remaining + 1;
        else revert NotParty();
        emit IOUOffer(id, msg.sender, remaining);

        if (r.debtorOffer != 0 && r.debtorOffer == r.creditorOffer) {
            r.debtorOffer = 0;
            r.creditorOffer = 0;
            if (remaining == 0) {
                r.status = r.paid == 0 ? Status.Cancelled : Status.Settled;
                r.iou.amount = r.paid;
            } else {
                r.iou.amount = r.paid + remaining;
                r.status = Status.Pending;
            }
            emit IOUResolved(id, remaining);
        }
    }

    // --------------------------------------------------------------- credit lines

    /// @notice Let `borrower` overdraw up to `limit` of `token` in cycles, funded from
    ///         your deposit. Lowering the limit below what is used only stops new draws.
    function setCreditLine(address borrower, address token, uint128 limit) external {
        _requireToken(token);
        if (borrower == msg.sender) revert SelfIOU();
        creditLine[msg.sender][borrower][token].limit = limit;
        emit CreditLineSet(msg.sender, borrower, token, limit);
    }

    /// @notice Repay a lender from your Setoff balance.
    function repay(address lender, address token, uint128 amount) external {
        CreditLine storage line = creditLine[lender][msg.sender][token];
        if (amount == 0) revert ZeroAmount();
        if (amount > line.used) revert OverRepay();
        uint256 bal = balanceOf[msg.sender][token];
        if (amount > bal) revert InsufficientBalance();
        line.used -= amount;
        balanceOf[msg.sender][token] = bal - amount;
        balanceOf[lender][token] += amount;
        emit CreditRepaid(msg.sender, lender, token, amount);
    }

    // ---------------------------------------------------------------- conversion

    /// @notice Opt in (or out, with 0) to having your net `sell` position converted into
    ///         `buy` during cycles, never below `minRate` (buy per sell, 1e6 = 1:1).
    function setFxPreference(address sell, address buy, uint64 minRate) external {
        _requireToken(sell);
        _requireToken(buy);
        if (sell == buy) revert UnsupportedToken(buy);
        fxMinRate[msg.sender][sell][buy] = minRate;
        emit FxPreferenceSet(msg.sender, sell, buy, minRate);
    }

    // -------------------------------------------------------------------- cycles

    /// @notice Clear a set of IOUs in one atomic cycle.
    /// @param ids     IOUs to pay. Each must be open and unexpired.
    /// @param amounts How much of each to pay now, at most what is still owed. Paying
    ///                the full remainder settles it; less leaves the rest open.
    /// @param parties Every debtor and creditor in `ids`, strictly ascending. Supplying
    ///                the index lets the contract net without a hashmap; ordering
    ///                proves uniqueness.
    /// @param draws   Credit-line draws that fund shortfalls, applied before netting.
    /// @param fx      Currency conversions between opted-in parties, applied to nets. Each
    ///                must meet its account's minimum rate, and per token the total sold
    ///                must equal the total bought, so conversions create nothing.
    /// @dev Reverts if any net debtor's deposit (plus draws) can't cover its net.
    ///      Choosing what to include is the solver's job; the contract checks it all.
    function settle(
        bytes32[] calldata ids,
        uint128[] calldata amounts,
        address[] calldata parties,
        Draw[] calldata draws,
        Conversion[] calldata fx
    ) external returns (uint64 cycle) {
        uint256 n = ids.length;
        if (n == 0) revert EmptyCycle();
        if (n > MAX_IOUS_PER_CYCLE) revert CycleTooLarge();
        if (amounts.length != n) revert LengthMismatch();
        for (uint256 i = 1; i < parties.length; ++i) {
            if (parties[i] <= parties[i - 1]) revert PartiesNotSorted();
        }

        cycle = ++cycleCount;
        for (uint256 i; i < draws.length; ++i) {
            _draw(cycle, draws[i]);
        }

        uint256 t = _tokens.length;
        int256[] memory nets = new int256[](parties.length * t);
        uint256[] memory gross = new uint256[](t);
        for (uint256 i; i < n; ++i) {
            _applyIOU(ids[i], amounts[i], cycle, parties, nets, gross);
        }
        if (fx.length != 0) _convert(cycle, fx, parties, nets);

        uint256[] memory netFunded = new uint256[](t);
        for (uint256 p; p < parties.length; ++p) {
            for (uint256 k; k < t; ++k) {
                int256 net = nets[p * t + k];
                if (net == 0) continue;
                address token = _tokens[k];
                if (net < 0) {
                    uint256 owed = uint256(-net);
                    uint256 bal = balanceOf[parties[p]][token];
                    if (bal < owed) revert InsufficientDeposit(parties[p], token, owed, bal);
                    balanceOf[parties[p]][token] = bal - owed;
                    netFunded[k] += owed;
                } else {
                    balanceOf[parties[p]][token] += uint256(net);
                }
                emit NetPosition(cycle, parties[p], token, net);
            }
        }

        emit CycleSettled(cycle, msg.sender, n, gross, netFunded);
    }

    // --------------------------------------------------------------------- views

    function hashIOU(IOU calldata iou) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    IOU_TYPEHASH, iou.debtor, iou.creditor, iou.token, iou.amount, iou.deadline, iou.nonce, iou.ref
                )
            )
        );
    }

    /// @return iou    the IOU, with `amount` as its current face value
    /// @return status Pending also covers partly paid IOUs (`paid` > 0)
    /// @return cycle  last cycle that paid any of it
    /// @return paid   total paid so far
    function getIOU(bytes32 id) external view returns (IOU memory iou, Status status, uint64 cycle, uint128 paid) {
        Record storage r = _records[id];
        return (r.iou, r.status, r.cycle, r.paid);
    }

    /// @return debtorOffer   the debtor's pending dispute proposal, or -1 for none
    /// @return creditorOffer the creditor's pending dispute proposal, or -1 for none
    function offers(bytes32 id) external view returns (int256 debtorOffer, int256 creditorOffer) {
        Record storage r = _records[id];
        return (int256(uint256(r.debtorOffer)) - 1, int256(uint256(r.creditorOffer)) - 1);
    }

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ internal

    function _convert(uint64 cycle, Conversion[] calldata fx, address[] calldata parties, int256[] memory nets)
        internal
    {
        uint256 t = _tokens.length;
        int256[] memory balance = new int256[](t); // per token: bought − sold, must end at 0
        for (uint256 i; i < fx.length; ++i) {
            Conversion calldata c = fx[i];
            uint256 minRate = fxMinRate[c.account][c.sell][c.buy];
            if (minRate == 0) revert FxNotAllowed(c.account, c.sell, c.buy);
            if (c.sellAmount == 0 || c.buyAmount == 0) revert ZeroAmount();
            uint256 rate = (uint256(c.buyAmount) * 1e6) / c.sellAmount;
            if (rate < minRate) revert FxRateTooLow(c.account, rate, minRate);
            uint256 p = _partyIndex(parties, c.account);
            uint256 ks = _tokenIndex(c.sell);
            uint256 kb = _tokenIndex(c.buy);
            nets[p * t + ks] -= int256(uint256(c.sellAmount));
            nets[p * t + kb] += int256(uint256(c.buyAmount));
            // Only the leftover difference converts: you can sell what you're owed in one
            // currency to cover what you owe in the other, never your deposit.
            if (nets[p * t + ks] < 0 || nets[p * t + kb] > 0) revert FxExceedsNet(c.account);
            balance[ks] -= int256(uint256(c.sellAmount));
            balance[kb] += int256(uint256(c.buyAmount));
            emit Converted(cycle, c.account, c.sell, c.sellAmount, c.buy, c.buyAmount);
        }
        for (uint256 k; k < t; ++k) {
            if (balance[k] != 0) revert FxUnbalanced(_tokens[k]);
        }
    }

    function _draw(uint64 cycle, Draw calldata d) internal {
        _requireToken(d.token);
        if (d.amount == 0) revert ZeroAmount();
        CreditLine storage line = creditLine[d.lender][d.borrower][d.token];
        uint128 available = line.limit > line.used ? line.limit - line.used : 0;
        if (d.amount > available) revert OverCredit(d.lender, d.borrower, d.amount, available);
        uint256 lenderBal = balanceOf[d.lender][d.token];
        if (d.amount > lenderBal) revert InsufficientDeposit(d.lender, d.token, d.amount, lenderBal);
        line.used += d.amount;
        balanceOf[d.lender][d.token] = lenderBal - d.amount;
        balanceOf[d.borrower][d.token] += d.amount;
        emit CreditDrawn(cycle, d.borrower, d.lender, d.token, d.amount);
    }

    function _applyIOU(
        bytes32 id,
        uint128 pay,
        uint64 cycle,
        address[] calldata parties,
        int256[] memory nets,
        uint256[] memory gross
    ) internal {
        Record storage r = _records[id];
        if (r.status != Status.Pending) revert NotPending(id);
        IOU memory iou = r.iou;
        if (block.timestamp > iou.deadline) revert Expired(id);
        uint128 open = iou.amount - r.paid;
        if (pay == 0) revert ZeroAmount();
        // Paying more than is owed is impossible, even if an id appears twice in one call.
        if (pay > open) revert OverPayment(id, pay, open);
        r.paid += pay;
        r.cycle = cycle;
        if (pay == open) r.status = Status.Settled;

        uint256 t = gross.length;
        uint256 k = _tokenIndex(iou.token);
        int256 amount = int256(uint256(pay));
        nets[_partyIndex(parties, iou.debtor) * t + k] -= amount;
        nets[_partyIndex(parties, iou.creditor) * t + k] += amount;
        gross[k] += pay;
        emit IOUSettled(id, cycle, iou.debtor, iou.creditor, iou.token, pay, open - pay, iou.ref);
    }

    function _requireParty(Record storage r) internal view {
        if (msg.sender != r.iou.debtor && msg.sender != r.iou.creditor) revert NotParty();
    }

    function _requireToken(address token) internal view {
        if (_tokenIndex(token) == type(uint256).max) revert UnsupportedToken(token);
    }

    function _tokenIndex(address token) internal view returns (uint256) {
        uint256 n = _tokens.length;
        for (uint256 i; i < n; ++i) {
            if (_tokens[i] == token) return i;
        }
        return type(uint256).max;
    }

    function _partyIndex(address[] calldata parties, address account) internal pure returns (uint256) {
        uint256 lo;
        uint256 hi = parties.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) >> 1;
            address a = parties[mid];
            if (a == account) return mid;
            if (a < account) lo = mid + 1;
            else hi = mid;
        }
        revert PartyMissing(account);
    }
}
