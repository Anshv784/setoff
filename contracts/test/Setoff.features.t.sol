// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Setoff} from "../src/Setoff.sol";
import {SetoffTest} from "./Setoff.t.sol";

/// Partial payments, disputes and credit lines. Reuses SetoffTest's setup and helpers.
contract SetoffFeaturesTest is SetoffTest {
    function _one(bytes32 id) internal pure returns (bytes32[] memory ids) {
        ids = new bytes32[](1);
        ids[0] = id;
    }

    function _amt(uint128 a) internal pure returns (uint128[] memory xs) {
        xs = new uint128[](1);
        xs[0] = a;
    }

    function _status(bytes32 id) internal view returns (Setoff.Status s, uint128 amount, uint128 paid) {
        Setoff.IOU memory iou;
        (iou, s,, paid) = setoff.getIOU(id);
        amount = iou.amount;
    }

    // ----------------------------------------------------------- partial payments

    function test_partialThenRest() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 10e6);

        vm.expectEmit(address(setoff));
        emit Setoff.IOUSettled(id, 1, alice, bob, address(usdc), 4e6, 6e6, keccak256(abi.encode("invoice", uint256(1))));
        setoff.settle(_one(id), _amt(4e6), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
        (Setoff.Status s,, uint128 paid) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Pending));
        assertEq(paid, 4e6);
        assertEq(setoff.balanceOf(bob, address(usdc)), 4e6);

        setoff.settle(_one(id), _amt(6e6), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
        (s,, paid) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Settled));
        assertEq(paid, 10e6);
        assertEq(setoff.balanceOf(bob, address(usdc)), 10e6);
    }

    function test_cannotOverpay() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 20e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.OverPayment.selector, id, uint128(11e6), uint128(10e6)));
        setoff.settle(_one(id), _amt(11e6), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
    }

    function test_duplicatePiecesCannotExceedTheBill() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 20e6);
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = id;
        ids[1] = id;
        uint128[] memory a = new uint128[](2);
        a[0] = 6e6;
        a[1] = 6e6;
        vm.expectRevert(abi.encodeWithSelector(Setoff.OverPayment.selector, id, uint128(6e6), uint128(4e6)));
        setoff.settle(ids, a, _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
        a[1] = 4e6;
        setoff.settle(ids, a, _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
        (Setoff.Status s,,) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Settled));
    }

    function test_zeroPaymentRejected() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.expectRevert(Setoff.ZeroAmount.selector);
        setoff.settle(_one(id), _amt(0), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
    }

    function test_amountsMustMatchIds() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.expectRevert(Setoff.LengthMismatch.selector);
        setoff.settle(_one(id), new uint128[](0), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
    }

    // ------------------------------------------------------------------- disputes

    function test_disputeFreezesUntilBothAgree() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 10e6);

        vm.prank(carol);
        vm.expectRevert(Setoff.NotParty.selector);
        setoff.dispute(id);

        vm.prank(alice);
        setoff.dispute(id);
        vm.expectRevert(abi.encodeWithSelector(Setoff.NotPending.selector, id));
        setoff.settle(_one(id), _amt(10e6), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));

        // Different offers: still frozen.
        vm.prank(alice);
        setoff.offer(id, 7e6);
        vm.prank(bob);
        setoff.offer(id, 9e6);
        (Setoff.Status s,,) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Disputed));
        (int256 dOffer, int256 cOffer) = setoff.offers(id);
        assertEq(dOffer, 7e6);
        assertEq(cOffer, 9e6);

        // Creditor comes down to 8, debtor comes up to 8: resolved at 8.
        vm.prank(bob);
        setoff.offer(id, 8e6);
        vm.prank(alice);
        vm.expectEmit(address(setoff));
        emit Setoff.IOUResolved(id, 8e6);
        setoff.offer(id, 8e6);
        uint128 amount;
        (s, amount,) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Pending));
        assertEq(amount, 8e6);

        setoff.settle(_one(id), _amt(8e6), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));
        assertEq(setoff.balanceOf(bob, address(usdc)), 8e6);
        assertEq(setoff.balanceOf(alice, address(usdc)), 2e6);
    }

    function test_agreeingOnZeroCancels() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(bob);
        setoff.dispute(id);
        vm.prank(alice);
        setoff.offer(id, 0);
        vm.prank(bob);
        setoff.offer(id, 0);
        (Setoff.Status s,,) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Cancelled));
    }

    function test_disputeAfterPartialKeepsWhatWasPaid() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 4e6);
        setoff.settle(_one(id), _amt(4e6), _sorted(alice, bob, carol), _noDraws(), new Setoff.Conversion[](0));

        vm.prank(alice);
        setoff.dispute(id);
        // Can't agree on more than what's still open (6).
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Setoff.OverPayment.selector, id, uint128(7e6), uint128(6e6)));
        setoff.offer(id, 7e6);
        // Both agree nothing more is owed: settled at what was paid.
        vm.prank(alice);
        setoff.offer(id, 0);
        vm.prank(bob);
        setoff.offer(id, 0);
        (Setoff.Status s, uint128 amount, uint128 paid) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Settled));
        assertEq(amount, 4e6);
        assertEq(paid, 4e6);
        assertEq(setoff.balanceOf(bob, address(usdc)), 4e6);
    }

    function test_offerOnlyWhileDisputed() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Setoff.NotDisputed.selector, id));
        setoff.offer(id, 5e6);
    }

    function test_disputedCanStillBeCancelled() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.dispute(id);
        vm.prank(bob);
        setoff.cancel(id);
        (Setoff.Status s,,) = _status(id);
        assertEq(uint8(s), uint8(Setoff.Status.Cancelled));
    }

    // --------------------------------------------------------------- credit lines

    function _draw(address borrower, address lender, uint128 amount) internal view returns (Setoff.Draw[] memory d) {
        d = new Setoff.Draw[](1);
        d[0] = Setoff.Draw({borrower: borrower, lender: lender, token: address(usdc), amount: amount});
    }

    function test_creditCoversShortfallAndIsRepaid() public {
        // Alice owes Bob 10 but has only 6; Carol lends her up to 5.
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(alice);
        setoff.deposit(address(usdc), 6e6);
        vm.startPrank(carol);
        setoff.deposit(address(usdc), 20e6);
        setoff.setCreditLine(alice, address(usdc), 5e6);
        vm.stopPrank();

        setoff.settle(_one(id), _amt(10e6), _sorted(alice, bob, carol), _draw(alice, carol, 4e6), new Setoff.Conversion[](0));
        assertEq(setoff.balanceOf(bob, address(usdc)), 10e6);
        assertEq(setoff.balanceOf(alice, address(usdc)), 0);
        assertEq(setoff.balanceOf(carol, address(usdc)), 16e6);
        (uint128 limit, uint128 used) = setoff.creditLine(carol, alice, address(usdc));
        assertEq(limit, 5e6);
        assertEq(used, 4e6);

        // Alice repays later from a new deposit.
        vm.startPrank(alice);
        setoff.deposit(address(usdc), 4e6);
        setoff.repay(carol, address(usdc), 4e6);
        vm.stopPrank();
        (, used) = setoff.creditLine(carol, alice, address(usdc));
        assertEq(used, 0);
        assertEq(setoff.balanceOf(carol, address(usdc)), 20e6);
    }

    function test_drawLimitedByLineAndLenderDeposit() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.prank(carol);
        setoff.setCreditLine(alice, address(usdc), 5e6);

        uint128[] memory a = _amt(10e6);
        address[] memory p = _sorted(alice, bob, carol);
        Setoff.Draw[] memory tooMuch = _draw(alice, carol, 6e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.OverCredit.selector, carol, alice, uint128(6e6), uint128(5e6)));
        setoff.settle(_one(id), a, p, tooMuch, new Setoff.Conversion[](0));

        // Within the line, but Carol hasn't deposited anything to lend.
        Setoff.Draw[] memory ok = _draw(alice, carol, 5e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.InsufficientDeposit.selector, carol, address(usdc), 5e6, 0));
        setoff.settle(_one(id), a, p, ok, new Setoff.Conversion[](0));
    }

    function test_onlyTheLenderGrantsCredit() public {
        // Lines are keyed by msg.sender as lender: Bob granting Alice credit gives Bob nothing from Carol.
        vm.prank(bob);
        setoff.setCreditLine(alice, address(usdc), 100e6);
        (uint128 limit,) = setoff.creditLine(carol, bob, address(usdc));
        assertEq(limit, 0);
        (limit,) = setoff.creditLine(bob, alice, address(usdc));
        assertEq(limit, 100e6);
        vm.prank(alice);
        vm.expectRevert(Setoff.SelfIOU.selector);
        setoff.setCreditLine(alice, address(usdc), 1e6);
    }

    function test_cannotRepayMoreThanUsed() public {
        vm.prank(alice);
        vm.expectRevert(Setoff.OverRepay.selector);
        setoff.repay(carol, address(usdc), 1);
    }

    function test_loweringLimitStopsNewDraws() public {
        bytes32 id = _post(_iou(alice, bob, address(usdc), 10e6, 1));
        vm.startPrank(carol);
        setoff.deposit(address(usdc), 20e6);
        setoff.setCreditLine(alice, address(usdc), 10e6);
        setoff.setCreditLine(alice, address(usdc), 0);
        vm.stopPrank();
        uint128[] memory a = _amt(10e6);
        address[] memory p = _sorted(alice, bob, carol);
        Setoff.Draw[] memory d = _draw(alice, carol, 1e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.OverCredit.selector, carol, alice, uint128(1e6), uint128(0)));
        setoff.settle(_one(id), a, p, d, new Setoff.Conversion[](0));
    }
}
