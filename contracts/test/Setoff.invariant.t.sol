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
        (Setoff.IOU memory iou, Setoff.Status st,) = setoff.getIOU(id);
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
            (, Setoff.Status st,) = setoff.getIOU(pending[start + j]);
            if (st == Setoff.Status.Pending) buf[n++] = pending[start + j];
        }
        if (n == 0) return;
        bytes32[] memory ids = new bytes32[](n);
        for (uint256 j; j < n; ++j) {
            ids[j] = buf[j];
        }
        address[] memory parties = _sortedUsers();

        vm.recordLogs();
        try setoff.settle(ids, parties) {
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
            (Setoff.IOU memory iou, Setoff.Status st,) = setoff.getIOU(pending[start + j]);
            if (st != Setoff.Status.Pending) continue;
            buf[n++] = pending[start + j];
            uint256 k = iou.token == address(toks[0]) ? 0 : 1;
            nets[_userIndex(iou.debtor) * 2 + k] -= int256(uint256(iou.amount));
            nets[_userIndex(iou.creditor) * 2 + k] += int256(uint256(iou.amount));
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
        setoff.settle(ids, _sortedUsers());
        ++cyclesSettled;
        _tallyCycle();
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
        bytes4[] memory actions = new bytes4[](6);
        actions[0] = SetoffHandler.deposit.selector;
        actions[1] = SetoffHandler.withdraw.selector;
        actions[2] = SetoffHandler.submit.selector;
        actions[3] = SetoffHandler.cancel.selector;
        actions[4] = SetoffHandler.settle.selector;
        actions[5] = SetoffHandler.settleFunded.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: actions}));
    }

    /// The contract always holds exactly what its ledger owes: cycles never mint or burn.
    function invariant_solvent() public view {
        assertEq(usdc.balanceOf(address(setoff)), handler.ledgerTotal(0), "USDC ledger != holdings");
        assertEq(eurc.balanceOf(address(setoff)), handler.ledgerTotal(1), "EURC ledger != holdings");
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
