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
        Cancelled
    }

    struct Record {
        IOU iou;
        Status status;
        uint64 cycle; // cycle that settled it (0 = unsettled)
    }

    bytes32 public constant IOU_TYPEHASH = keccak256(
        "IOU(address debtor,address creditor,address token,uint128 amount,uint64 deadline,uint256 nonce,bytes32 ref)"
    );
    uint256 public constant MAX_IOUS_PER_CYCLE = 256;

    /// @notice Settlement tokens, fixed at deployment (USDC, EURC).
    address[] internal _tokens;

    mapping(address account => mapping(address token => uint256)) public balanceOf;
    mapping(bytes32 id => Record) internal _records;
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
    event IOUSettled(
        bytes32 indexed id,
        uint64 indexed cycle,
        address indexed debtor,
        address creditor,
        address token,
        uint128 amount,
        bytes32 ref
    );
    event NetPosition(uint64 indexed cycle, address indexed account, address indexed token, int256 net);
    /// @param gross total face value of IOUs settled, per token (same order as tokens())
    /// @param netFunded total debited from net debtors, per token — the liquidity actually used
    event CycleSettled(
        uint64 indexed cycle, address indexed solver, uint256 iouCount, uint256[] gross, uint256[] netFunded
    );

    error UnsupportedToken(address token);
    error ZeroAmount();
    error SelfIOU();
    error Expired(bytes32 id);
    error AlreadySubmitted(bytes32 id);
    error BadSignature();
    error NotPending(bytes32 id);
    error NotParty();
    error EmptyCycle();
    error CycleTooLarge();
    error PartiesNotSorted();
    error PartyMissing(address account);
    error InsufficientDeposit(address account, address token, uint256 needed, uint256 available);
    error InsufficientBalance();

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
        _records[id] = Record({iou: iou, status: Status.Pending, cycle: 0});
        emit IOUSubmitted(id, iou.debtor, iou.creditor, iou.token, iou.amount, iou.deadline, iou.nonce, iou.ref);
    }

    /// @notice Debtor withdraws a pending IOU, or creditor rejects/forgives it.
    function cancel(bytes32 id) external {
        Record storage r = _records[id];
        if (r.status != Status.Pending) revert NotPending(id);
        if (msg.sender != r.iou.debtor && msg.sender != r.iou.creditor) revert NotParty();
        r.status = Status.Cancelled;
        emit IOUCancelled(id, msg.sender);
    }

    // -------------------------------------------------------------------- cycles

    /// @notice Clear a set of pending IOUs in one atomic cycle.
    /// @param ids     IOUs to settle. Each must be pending and unexpired.
    /// @param parties Every debtor and creditor in `ids`, strictly ascending. Supplying
    ///                the index lets the contract net without a hashmap; ordering
    ///                proves uniqueness.
    /// @dev Reverts if any net debtor's deposit cannot cover their net position.
    ///      Choosing a fundable subset of the pool is the solver's job.
    function settle(bytes32[] calldata ids, address[] calldata parties) external returns (uint64 cycle) {
        uint256 n = ids.length;
        if (n == 0) revert EmptyCycle();
        if (n > MAX_IOUS_PER_CYCLE) revert CycleTooLarge();
        for (uint256 i = 1; i < parties.length; ++i) {
            if (parties[i] <= parties[i - 1]) revert PartiesNotSorted();
        }

        cycle = ++cycleCount;
        uint256 t = _tokens.length;
        int256[] memory nets = new int256[](parties.length * t);
        uint256[] memory gross = new uint256[](t);

        for (uint256 i; i < n; ++i) {
            _applyIOU(ids[i], cycle, parties, nets, gross);
        }

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

    function getIOU(bytes32 id) external view returns (IOU memory iou, Status status, uint64 cycle) {
        Record storage r = _records[id];
        return (r.iou, r.status, r.cycle);
    }

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ internal

    function _applyIOU(
        bytes32 id,
        uint64 cycle,
        address[] calldata parties,
        int256[] memory nets,
        uint256[] memory gross
    ) internal {
        Record storage r = _records[id];
        // Marking settled before moving on also rejects duplicate ids in one call.
        if (r.status != Status.Pending) revert NotPending(id);
        IOU memory iou = r.iou;
        if (block.timestamp > iou.deadline) revert Expired(id);
        r.status = Status.Settled;
        r.cycle = cycle;

        uint256 t = gross.length;
        uint256 k = _tokenIndex(iou.token);
        int256 amount = int256(uint256(iou.amount));
        nets[_partyIndex(parties, iou.debtor) * t + k] -= amount;
        nets[_partyIndex(parties, iou.creditor) * t + k] += amount;
        gross[k] += iou.amount;
        emit IOUSettled(id, cycle, iou.debtor, iou.creditor, iou.token, iou.amount, iou.ref);
    }

    function _requireToken(address token) internal view {
        if (_tokenIndex(token) == type(uint256).max) revert UnsupportedToken(token);
    }

    function _tokenIndex(address token) internal view returns (uint256) {
        for (uint256 i; i < _tokens.length; ++i) {
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
