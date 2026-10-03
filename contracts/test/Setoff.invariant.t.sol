// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {Setoff} from "../src/Setoff.sol";
import {MockStable} from "./Setoff.t.sol";

/// Drives random sequences of deposits, IOUs, cancels, cycles and withdrawals.
contract SetoffHandler is Test {
    Setoff public setoff;
    MockStable[2] public toks;
    uint256[4] internal keys = [uint256(0xA11CE), 0xB0B, 0xCA201, 0xD4A3];
    address[4] public users;

    bytes32[] public pending;
    uint256 internal nonce;
    uint256 public cyclesSettled;
    uint256 public totalGross;
    uint256 public totalNet;

    constructor(Setoff s, MockStable usdc, MockStable eurc) {
        setoff = s;
        toks = [usdc, eurc];
        for (uint256 i; i < 4; ++i) {
            users[i] = vm.addr(keys[i]);
            for (uint256 k; k < 2; ++k) {
                toks[k].mint(users[i], 1e15);
                vm.prank(users[i]);
                toks[k].approve(address(s), type(uint256).max);
            }
        }
    }

    function deposit(uint256 u, uint256 k, uint256 amt) external {
        u %= 4;
        k %= 2;
        amt = bound(amt, 1, 1e12);
        vm.prank(users[u]);
        setoff.deposit(address(toks[k]), amt);
    }

    function withdraw(uint256 u, uint256 k, uint256 amt) external {
        u %= 4;
        k %= 2;
        uint256 bal = setoff.balanceOf(users[u], address(toks[k]));
        if (bal == 0) return;
        vm.prank(users[u]);
        setoff.withdraw(address(toks[k]), bound(amt, 1, bal));
    }

    function submit(uint256 d, uint256 c, uint256 k, uint256 amt) external {
        d %= 4;
        c = (d + 1 + (c % 3)) % 4;
        Setoff.IOU memory iou = Setoff.IOU({
            debtor: users[d],
            creditor: users[c],
            token: address(toks[k % 2]),
            amount: uint128(bound(amt, 1, 1e11)),
            deadline: uint64(block.timestamp + 365 days),
            nonce: ++nonce,
            ref: bytes32(nonce)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[d], setoff.hashIOU(iou));
        pending.push(setoff.submit(iou, abi.encodePacked(r, s, v)));
    }

    function cancel(uint256 i, bool byCreditor) external {
        if (pending.length == 0) return;
        i %= pending.length;
        bytes32 id = pending[i];
        (Setoff.IOU memory iou, Setoff.Status st,,) = setoff.getIOU(id);
        if (st != Setoff.Status.Pending) return;
        vm.prank(byCreditor ? iou.creditor : iou.debtor);
        setoff.cancel(id);
    }

    /// Try to settle a random window of pending IOUs; a revert (underfunded) is fine.
    function settle(uint256 start, uint256 len) external {
        if (pending.length == 0) return;
        start %= pending.length;
        len = bound(len, 1, 8);
        bytes32[] memory buf = new bytes32[](len);
        uint256 n;
        for (uint256 j; j < len && start + j < pending.length; ++j) {
            (, Setoff.Status st,,) = setoff.getIOU(pending[start + j]);
            if (st == Setoff.Status.Pending) buf[n++] = pending[start + j];
        }
        if (n == 0) return;
        bytes32[] memory ids = new bytes32[](n);
        for (uint256 j; j < n; ++j) {
            ids[j] = buf[j];
        }
        address[] memory parties = _sortedUsers();

        vm.recordLogs();
        try setoff.settle(ids, _full(ids), parties, new Setoff.Draw[](0), new Setoff.Conversion[](0)) {
            ++cyclesSettled;
            _tallyCycle();
        } catch {}
    }

    /// Same as settle, but first deposits whatever each net debtor is short, so
    /// runs reliably exercise successful cycles rather than only reverts.
    function settleFunded(uint256 start, uint256 len) external {
        if (pending.length == 0) return;
        start %= pending.length;
        len = bound(len, 1, 8);
        bytes32[] memory buf = new bytes32[](len);
        uint256 n;
        int256[8] memory nets; // users[4] x tokens[2]
        for (uint256 j; j < len && start + j < pending.length; ++j) {
            (Setoff.IOU memory iou, Setoff.Status st,, uint128 paid) = setoff.getIOU(pending[start + j]);
            if (st != Setoff.Status.Pending) continue;
            buf[n++] = pending[start + j];
            uint256 k = iou.token == address(toks[0]) ? 0 : 1;
            // What this cycle will actually pay: the remainder, not the face value.
            int256 open = int256(uint256(iou.amount - paid));
            nets[_userIndex(iou.debtor) * 2 + k] -= open;
            nets[_userIndex(iou.creditor) * 2 + k] += open;
        }
        if (n == 0) return;
        for (uint256 u; u < 4; ++u) {
            for (uint256 k; k < 2; ++k) {
                int256 net = nets[u * 2 + k];
                if (net >= 0) continue;
                uint256 bal = setoff.balanceOf(users[u], address(toks[k]));
                if (bal >= uint256(-net)) continue;
                vm.prank(users[u]);
                setoff.deposit(address(toks[k]), uint256(-net) - bal);
            }
        }
        bytes32[] memory ids = new bytes32[](n);
        for (uint256 j; j < n; ++j) {
            ids[j] = buf[j];
        }
        vm.recordLogs();
        setoff.settle(ids, _full(ids), _sortedUsers(), new Setoff.Draw[](0), new Setoff.Conversion[](0));
        ++cyclesSettled;
        _tallyCycle();
    }

    /// Pay roughly half of each IOU in a funded window: exercises partial payments.
    function settlePartial(uint256 start, uint256 len, uint256 frac) external {
        if (pending.length == 0) return;
        start %= pending.length;
        len = bound(len, 1, 6);
        frac = bound(frac, 1, 99);
        bytes32[] memory buf = new bytes32[](len);
        uint128[] memory amt = new uint128[](len);
        uint256 n;
        for (uint256 j; j < len && start + j < pending.length; ++j) {
            (Setoff.IOU memory iou, Setoff.Status st,, uint128 paid) = setoff.getIOU(pending[start + j]);
            if (st != Setoff.Status.Pending) continue;
            uint128 pay = uint128((uint256(iou.amount - paid) * frac) / 100);
            if (pay == 0) continue;
            buf[n] = pending[start + j];
            amt[n++] = pay;
        }
        if (n == 0) return;
        bytes32[] memory ids = new bytes32[](n);
        uint128[] memory amounts = new uint128[](n);
        for (uint256 j; j < n; ++j) {
            ids[j] = buf[j];
            amounts[j] = amt[j];
            (Setoff.IOU memory iou,,,) = setoff.getIOU(buf[j]);
            // Fund the debtor generously so the partial cycle succeeds.
            vm.prank(iou.debtor);
            setoff.deposit(iou.token, amt[j]);
        }
        vm.recordLogs();
        setoff.settle(ids, amounts, _sortedUsers(), new Setoff.Draw[](0), new Setoff.Conversion[](0));
        ++cyclesSettled;
        _tally();
    }

    /// Dispute an IOU and maybe resolve it at a random lower amount.
    function disputeAndResolve(uint256 i, uint256 frac, bool agree) external {
        if (pending.length == 0) return;
        bytes32 id = pending[i % pending.length];
        (Setoff.IOU memory iou, Setoff.Status st,, uint128 paid) = setoff.getIOU(id);
        if (st != Setoff.Status.Pending) return;
        vm.prank(iou.debtor);
        setoff.dispute(id);
        uint128 newRemaining = uint128((uint256(iou.amount - paid) * bound(frac, 0, 100)) / 100);
        vm.prank(iou.debtor);
        setoff.offer(id, newRemaining);
        if (agree) {
            vm.prank(iou.creditor);
            setoff.offer(id, newRemaining);
        }
    }

    /// A cycle where the debtor is fully funded by a credit line from another user.
    function creditCycle(uint256 i, uint256 lenderSeed) external {
        if (pending.length == 0) return;
        bytes32 id = pending[i % pending.length];
        (Setoff.IOU memory iou, Setoff.Status st,, uint128 paid) = setoff.getIOU(id);
        if (st != Setoff.Status.Pending) return;
        uint128 open = iou.amount - paid;
        address lender = users[lenderSeed % 4];
        if (lender == iou.debtor || lender == iou.creditor) return;
        vm.startPrank(lender);
        setoff.deposit(iou.token, open);
        (uint128 limit, uint128 used) = setoff.creditLine(lender, iou.debtor, iou.token);
        setoff.setCreditLine(iou.debtor, iou.token, limit > used + open ? limit : used + open);
        vm.stopPrank();
        // Only the shortfall is drawn; the debtor's own deposit is used first.
        uint256 have = setoff.balanceOf(iou.debtor, iou.token);
        if (have >= open) return;
        Setoff.Draw[] memory d = new Setoff.Draw[](1);
        d[0] = Setoff.Draw({borrower: iou.debtor, lender: lender, token: iou.token, amount: uint128(open - have)});
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = id;
        uint128[] memory a = new uint128[](1);
        a[0] = open;
        vm.recordLogs();
        setoff.settle(ids, a, _sortedUsers(), d, new Setoff.Conversion[](0));
        ++cyclesSettled;
        _tally();
    }

    /// Cross-currency pair between two opted-in users: a owes b USDC, b owes a EURC, and
    /// the leftovers convert into each other at whatever rate the amounts imply.
    function fxCycle(uint256 a, uint256 usd, uint256 eur) external {
        a %= 4;
        uint256 b = (a + 1) % 4;
        uint256 n0 = pending.length;
        this.submit(a, 0, 0, usd); // c=0 → creditor a+1, token USDC
        this.submit(b, 2, 1, eur); // creditor b+3 = a, token EURC
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = pending[n0];
        ids[1] = pending[n0 + 1];
        uint128[] memory amt = _full(ids);
        vm.prank(users[a]);
        setoff.setFxPreference(address(toks[1]), address(toks[0]), 1);
        vm.prank(users[b]);
        setoff.setFxPreference(address(toks[0]), address(toks[1]), 1);
        Setoff.Conversion[] memory fx = new Setoff.Conversion[](2);
        fx[0] = Setoff.Conversion(users[a], address(toks[1]), address(toks[0]), amt[1], amt[0]);
        fx[1] = Setoff.Conversion(users[b], address(toks[0]), address(toks[1]), amt[0], amt[1]);
        vm.recordLogs();
        try setoff.settle(ids, amt, _sortedUsers(), new Setoff.Draw[](0), fx) {
            ++cyclesSettled;
            _tallyCycle();
        } catch {}
    }

    /// Repay part of any outstanding credit.
    function repaySome(uint256 b, uint256 l, uint256 k, uint256 amt) external {
        address borrower = users[b % 4];
        address lender = users[l % 4];
        address token = address(toks[k % 2]);
        (, uint128 used) = setoff.creditLine(lender, borrower, token);
        uint256 bal = setoff.balanceOf(borrower, token);
        uint256 cap = used < bal ? used : bal;
        if (cap == 0) return;
        vm.prank(borrower);
        setoff.repay(lender, token, uint128(bound(amt, 1, cap)));
    }

    function _tally() internal {
        _tallyCycle();
    }

    function pendingLength() external view returns (uint256) {
        return pending.length;
    }

    function pendingAt(uint256 i) external view returns (bytes32) {
        return pending[i];
    }

    function _full(bytes32[] memory ids) internal view returns (uint128[] memory a) {
        a = new uint128[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            (Setoff.IOU memory iou,,, uint128 paid) = setoff.getIOU(ids[i]);
            a[i] = iou.amount - paid;
        }
    }

    function _userIndex(address a) internal view returns (uint256) {
        for (uint256 i; i < 4; ++i) {
            if (users[i] == a) return i;
        }
        revert("unknown user");
    }

    function _tallyCycle() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = Setoff.CycleSettled.selector;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != sig) continue;
            (, uint256[] memory gross, uint256[] memory net) = abi.decode(logs[i].data, (uint256, uint256[], uint256[]));
            for (uint256 k; k < gross.length; ++k) {
                totalGross += gross[k];
                totalNet += net[k];
            }
        }
    }

    function _sortedUsers() internal view returns (address[] memory p) {
        p = new address[](4);
        for (uint256 i; i < 4; ++i) {
            p[i] = users[i];
        }
        for (uint256 i; i < 4; ++i) {
            for (uint256 j = i + 1; j < 4; ++j) {
                if (p[j] < p[i]) (p[i], p[j]) = (p[j], p[i]);
            }
        }
    }

    function ledgerTotal(uint256 k) external view returns (uint256 sum) {
        for (uint256 i; i < 4; ++i) {
            sum += setoff.balanceOf(users[i], address(toks[k]));
        }
    }
}

contract SetoffInvariantTest is Test {
    Setoff setoff;
    MockStable usdc;
    MockStable eurc;
    SetoffHandler handler;

    function setUp() public {
        usdc = new MockStable("USDC");
        eurc = new MockStable("EURC");
        address[] memory toks = new address[](2);
        toks[0] = address(usdc);
        toks[1] = address(eurc);
        setoff = new Setoff(toks);
        handler = new SetoffHandler(setoff, usdc, eurc);
        targetContract(address(handler));
        bytes4[] memory actions = new bytes4[](11);
        actions[0] = SetoffHandler.deposit.selector;
        actions[1] = SetoffHandler.withdraw.selector;
        actions[2] = SetoffHandler.submit.selector;
        actions[3] = SetoffHandler.cancel.selector;
        actions[4] = SetoffHandler.settle.selector;
        actions[5] = SetoffHandler.settleFunded.selector;
        actions[6] = SetoffHandler.settlePartial.selector;
        actions[7] = SetoffHandler.disputeAndResolve.selector;
        actions[8] = SetoffHandler.creditCycle.selector;
        actions[9] = SetoffHandler.repaySome.selector;
        actions[10] = SetoffHandler.fxCycle.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: actions}));
    }

    /// The contract always holds exactly what its ledger owes: cycles never mint or burn.
    function invariant_solvent() public view {
        assertEq(usdc.balanceOf(address(setoff)), handler.ledgerTotal(0), "USDC ledger != holdings");
        assertEq(eurc.balanceOf(address(setoff)), handler.ledgerTotal(1), "EURC ledger != holdings");
    }

    /// No IOU is ever paid more than its face value, whatever mix of partial cycles,
    /// disputes and credit draws happened.
    function invariant_neverOverpaid() public view {
        for (uint256 i; i < handler.pendingLength(); ++i) {
            (Setoff.IOU memory iou,,, uint128 paid) = setoff.getIOU(handler.pendingAt(i));
            assertLe(paid, iou.amount, "IOU overpaid");
        }
    }

    /// Liquidity used can never exceed the face value cleared.
    function invariant_netNeverExceedsGross() public view {
        assertLe(handler.totalNet(), handler.totalGross());
    }
}

/// Deterministic check that the handler's funded path really clears cycles, so the
/// invariants above are exercised against successful settlements, not just reverts.
contract SetoffHandlerCoverageTest is SetoffInvariantTest {
    function test_handlerClearsCycles() public {
        for (uint256 i; i < 24; ++i) {
            handler.submit(i, i * 7, i, 1e6 + i * 31_337);
        }
        for (uint256 i; i < 6; ++i) {
            handler.settleFunded(i * 4, 4);
        }
        assertEq(handler.cyclesSettled(), 6);
        assertGt(handler.totalGross(), handler.totalNet());
        invariant_solvent();
        invariant_netNeverExceedsGross();
    }
}
