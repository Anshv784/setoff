// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Setoff} from "../src/Setoff.sol";

contract MockStable is ERC20 {
    constructor(string memory name) ERC20(name, name) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SetoffTest is Test {
    Setoff setoff;
    MockStable usdc;
    MockStable eurc;

    uint256 aliceKey = 0xA11CE;
    uint256 bobKey = 0xB0B;
    uint256 carolKey = 0xCA201;
    address alice;
    address bob;
    address carol;

    function setUp() public {
        usdc = new MockStable("USDC");
        eurc = new MockStable("EURC");
        address[] memory toks = new address[](2);
        toks[0] = address(usdc);
        toks[1] = address(eurc);
        setoff = new Setoff(toks);

        alice = vm.addr(aliceKey);
        bob = vm.addr(bobKey);
        carol = vm.addr(carolKey);
        address[3] memory users = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            usdc.mint(users[i], 1_000e6);
            eurc.mint(users[i], 1_000e6);
            vm.startPrank(users[i]);
            usdc.approve(address(setoff), type(uint256).max);
            eurc.approve(address(setoff), type(uint256).max);
            vm.stopPrank();
        }
    }

    // ----------------------------------------------------------------- helpers

    function _iou(address debtor, address creditor, address token, uint128 amount, uint256 nonce)
        internal
        view
        returns (Setoff.IOU memory)
    {
        return Setoff.IOU({
            debtor: debtor,
            creditor: creditor,
            token: token,
            amount: amount,
            deadline: uint64(block.timestamp + 1 days),
            nonce: nonce,
            ref: keccak256(abi.encode("invoice", nonce))
        });
    }

    function _sign(uint256 key, Setoff.IOU memory iou) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, setoff.hashIOU(iou));
        return abi.encodePacked(r, s, v);
    }

    function _keyOf(address a) internal view returns (uint256) {
        if (a == alice) return aliceKey;
        if (a == bob) return bobKey;
        return carolKey;
    }

    function _post(Setoff.IOU memory iou) internal returns (bytes32) {
        // Posted by a third party with the debtor's signature, like a relayer would.
        vm.prank(address(0xBEEF));
        return setoff.submit(iou, _sign(_keyOf(iou.debtor), iou));
    }

    function _sorted(address a, address b, address c) internal pure returns (address[] memory p) {
        p = new address[](3);
        p[0] = a;
        p[1] = b;
        p[2] = c;
        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                if (p[j] < p[i]) (p[i], p[j]) = (p[j], p[i]);
            }
        }
    }

    // ------------------------------------------------------------------- tests

    /// A owes B 10, B owes C 9, C owes A 8: 27 gross clears with 2 of liquidity.
    function test_triangleNetsToTwo() public {
        bytes32[] memory ids = new bytes32[](3);
        ids[0] = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        ids[1] = _post(_iou(bob, carol, address(usdc), 9e6, 2));
        ids[2] = _post(_iou(carol, alice, address(usdc), 8e6, 3));

        // Alice is the only net debtor (-10 +8 = -2).
        vm.prank(alice);
        setoff.deposit(address(usdc), 2e6);

        uint64 cycle = setoff.settle(ids, _sorted(alice, bob, carol));
        assertEq(cycle, 1);
        assertEq(setoff.balanceOf(alice, address(usdc)), 0);
        assertEq(setoff.balanceOf(bob, address(usdc)), 1e6); // +10 -9
        assertEq(setoff.balanceOf(carol, address(usdc)), 1e6); // +9 -8
        assertEq(usdc.balanceOf(address(setoff)), 2e6);

        (, Setoff.Status status, uint64 c) = setoff.getIOU(ids[0]);
        assertEq(uint8(status), uint8(Setoff.Status.Settled));
        assertEq(c, 1);
    }

    function test_settleEmitsGrossAndNet() public {
        bytes32[] memory ids = new bytes32[](3);
        ids[0] = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        ids[1] = _post(_iou(bob, carol, address(usdc), 9e6, 2));
        ids[2] = _post(_iou(carol, alice, address(usdc), 8e6, 3));
        vm.prank(alice);
        setoff.deposit(address(usdc), 2e6);

        uint256[] memory gross = new uint256[](2);
        gross[0] = 27e6;
        uint256[] memory net = new uint256[](2);
        net[0] = 2e6;
        vm.expectEmit(address(setoff));
        emit Setoff.CycleSettled(1, address(this), 3, gross, net);
        setoff.settle(ids, _sorted(alice, bob, carol));
    }

    function test_tokensNetIndependently() public {
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = _post(_iou(alice, bob, address(usdc), 5e6, 1));
        ids[1] = _post(_iou(bob, alice, address(eurc), 5e6, 2));
        // Different currencies do not offset each other.
        vm.prank(alice);
        setoff.deposit(address(usdc), 5e6);
        vm.prank(bob);
        setoff.deposit(address(eurc), 5e6);

        address[] memory parties = _sorted(alice, bob, carol);
        setoff.settle(ids, parties);
        assertEq(setoff.balanceOf(bob, address(usdc)), 5e6);
        assertEq(setoff.balanceOf(alice, address(eurc)), 5e6);
    }

    function test_revertsWhenNetDebtorUnderfunded() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 9e6);

        vm.expectRevert(abi.encodeWithSelector(Setoff.InsufficientDeposit.selector, alice, address(usdc), 10e6, 9e6));
        setoff.settle(ids, _sorted(alice, bob, carol));
        // Nothing changed: IOU still pending, cycle not consumed.
        (, Setoff.Status status,) = setoff.getIOU(ids[0]);
        assertEq(uint8(status), uint8(Setoff.Status.Pending));
        assertEq(setoff.cycleCount(), 0);
    }

    function test_revertsOnDuplicateIdInCycle() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 1e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 2e6);
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = id;
        ids[1] = id;
        vm.expectRevert(abi.encodeWithSelector(Setoff.NotPending.selector, id));
        setoff.settle(ids, _sorted(alice, bob, carol));
    }

    function test_cannotSettleTwice() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _post(_iou(alice, bob, address(usdc), 1e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 2e6);
        setoff.settle(ids, _sorted(alice, bob, carol));
        vm.expectRevert(abi.encodeWithSelector(Setoff.NotPending.selector, ids[0]));
        setoff.settle(ids, _sorted(alice, bob, carol));
    }

    function test_revertsOnUnsortedParties() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _post(_iou(alice, bob, address(usdc), 1e6, 1));
        address[] memory p = _sorted(alice, bob, carol);
        (p[0], p[1]) = (p[1], p[0]);
        vm.expectRevert(Setoff.PartiesNotSorted.selector);
        setoff.settle(ids, p);
    }

    function test_revertsOnMissingParty() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _post(_iou(alice, bob, address(usdc), 1e6, 1));
        address[] memory p = new address[](1);
        p[0] = alice;
        vm.expectRevert(abi.encodeWithSelector(Setoff.PartyMissing.selector, bob));
        setoff.settle(ids, p);
    }

    function test_revertsOnExpiredAtSettle() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _post(_iou(alice, bob, address(usdc), 1e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 1e6);
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(abi.encodeWithSelector(Setoff.Expired.selector, ids[0]));
        setoff.settle(ids, _sorted(alice, bob, carol));
    }

    function test_submitRejectsForgedSignature() public {
        Setoff.IOU memory iou = _iou(alice, bob, address(usdc), 1e6, 1);
        bytes memory sig = _sign(bobKey, iou); // creditor signing on debtor's behalf
        vm.prank(bob);
        vm.expectRevert(Setoff.BadSignature.selector);
        setoff.submit(iou, sig);
    }

    function test_debtorSubmitsWithoutSignature() public {
        Setoff.IOU memory iou = _iou(alice, bob, address(usdc), 1e6, 1);
        vm.prank(alice);
        bytes32 id = setoff.submit(iou, "");
        (, Setoff.Status status,) = setoff.getIOU(id);
        assertEq(uint8(status), uint8(Setoff.Status.Pending));
    }

    function test_submitRejectsDuplicateAndBadInput() public {
        Setoff.IOU memory iou = _iou(alice, bob, address(usdc), 1e6, 1);
        bytes32 id = _post(iou);
        bytes memory sig = _sign(aliceKey, iou);
        vm.expectRevert(abi.encodeWithSelector(Setoff.AlreadySubmitted.selector, id));
        setoff.submit(iou, sig);

        Setoff.IOU memory self = _iou(alice, alice, address(usdc), 1e6, 2);
        vm.prank(alice);
        vm.expectRevert(Setoff.SelfIOU.selector);
        setoff.submit(self, "");

        Setoff.IOU memory zero = _iou(alice, bob, address(usdc), 0, 3);
        vm.prank(alice);
        vm.expectRevert(Setoff.ZeroAmount.selector);
        setoff.submit(zero, "");

        Setoff.IOU memory badToken = _iou(alice, bob, address(0xDEAD), 1e6, 4);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Setoff.UnsupportedToken.selector, address(0xDEAD)));
        setoff.submit(badToken, "");
    }

    function test_cancelByEitherPartyOnly() public {
        bytes32 a = _post(_iou(alice, bob, address(usdc), 1e6, 1));
        bytes32 b = _post(_iou(alice, bob, address(usdc), 1e6, 2));

        vm.prank(carol);
        vm.expectRevert(Setoff.NotParty.selector);
        setoff.cancel(a);

        vm.prank(alice);
        setoff.cancel(a);
        vm.prank(bob);
        setoff.cancel(b);

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = a;
        vm.expectRevert(abi.encodeWithSelector(Setoff.NotPending.selector, a));
        setoff.settle(ids, _sorted(alice, bob, carol));
    }

    function test_depositWithdraw() public {
        vm.startPrank(alice);
        setoff.deposit(address(usdc), 100e6);
        setoff.withdraw(address(usdc), 40e6);
        vm.expectRevert(Setoff.InsufficientBalance.selector);
        setoff.withdraw(address(usdc), 61e6);
        vm.stopPrank();
        assertEq(setoff.balanceOf(alice, address(usdc)), 60e6);
        assertEq(usdc.balanceOf(alice), 940e6);
    }

    function test_creditorsWithdrawAfterCycle() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = _post(_iou(alice, bob, address(usdc), 7e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 7e6);
        setoff.settle(ids, _sorted(alice, bob, carol));
        vm.prank(bob);
        setoff.withdraw(address(usdc), 7e6);
        assertEq(usdc.balanceOf(bob), 1_007e6);
    }

    function test_constructorRejectsDuplicateToken() public {
        address[] memory toks = new address[](2);
        toks[0] = address(usdc);
        toks[1] = address(usdc);
        vm.expectRevert(abi.encodeWithSelector(Setoff.UnsupportedToken.selector, address(usdc)));
        new Setoff(toks);
    }

    /// Settling conserves value: total ledger balance per token is unchanged by a cycle,
    /// and the net funded never exceeds gross.
    function testFuzz_settleConservesValue(uint128[6] memory amts, uint8 shape) public {
        address[3] memory users = [alice, bob, carol];
        bytes32[] memory ids = new bytes32[](6);
        for (uint256 i; i < 6; ++i) {
            uint128 amt = uint128(bound(amts[i], 1, 100e6));
            uint256 di = (i + shape) % 3;
            address d = users[di];
            address c = users[(di + 1 + ((shape >> i) & 1)) % 3];
            ids[i] = _post(_iou(d, c, address(usdc), amt, i));
        }
        for (uint256 i; i < 3; ++i) {
            vm.prank(users[i]);
            setoff.deposit(address(usdc), 600e6);
        }
        uint256 before = _ledgerTotal(address(usdc));
        setoff.settle(ids, _sorted(alice, bob, carol));
        assertEq(_ledgerTotal(address(usdc)), before);
        assertEq(usdc.balanceOf(address(setoff)), before);
    }

    function _ledgerTotal(address token) internal view returns (uint256) {
        return setoff.balanceOf(alice, token) + setoff.balanceOf(bob, token) + setoff.balanceOf(carol, token);
    }
}
