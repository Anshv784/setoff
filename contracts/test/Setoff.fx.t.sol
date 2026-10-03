// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Setoff} from "../src/Setoff.sol";
import {SetoffTest} from "./Setoff.t.sol";

/// Opt-in USDC↔EURC conversion of leftover nets. Alice owes Bob 10.70 USDC and Bob owes
/// Alice 10 EURC: with both opted in, the two cancel and nobody deposits anything.
contract SetoffFxTest is SetoffTest {
    bytes32[] ids;
    uint128[] amts;

    function _cross() internal {
        ids.push(_post(_iou(alice, bob, address(usdc), 10.7e6, 1)));
        ids.push(_post(_iou(bob, alice, address(eurc), 10e6, 2)));
        amts.push(10.7e6);
        amts.push(10e6);
    }

    function _optIn(uint64 aliceMin, uint64 bobMin) internal {
        vm.prank(alice);
        setoff.setFxPreference(address(eurc), address(usdc), aliceMin); // sells EURC for USDC
        vm.prank(bob);
        setoff.setFxPreference(address(usdc), address(eurc), bobMin); // sells USDC for EURC
    }

    function _fx(uint128 eurAmt, uint128 usdAmt) internal view returns (Setoff.Conversion[] memory fx) {
        fx = new Setoff.Conversion[](2);
        fx[0] = Setoff.Conversion(alice, address(eurc), address(usdc), eurAmt, usdAmt);
        fx[1] = Setoff.Conversion(bob, address(usdc), address(eurc), usdAmt, eurAmt);
    }

    function _settle(Setoff.Conversion[] memory fx) internal {
        setoff.settle(ids, amts, _sorted(alice, bob, carol), _noDraws(), fx);
    }

    function test_crossCurrencyNetsToZero() public {
        _cross();
        _optIn(1.06e6, 0.93e6);
        _settle(_fx(10e6, 10.7e6));
        (, Setoff.Status s,,) = setoff.getIOU(ids[0]);
        assertEq(uint8(s), uint8(Setoff.Status.Settled));
        assertEq(setoff.balanceOf(alice, address(usdc)) + setoff.balanceOf(bob, address(eurc)), 0);
        assertEq(usdc.balanceOf(address(setoff)) + eurc.balanceOf(address(setoff)), 0);
    }

    function test_withoutFxEachDepositsOwnCurrency() public {
        _cross();
        vm.expectRevert();
        _settle(new Setoff.Conversion[](0));
    }

    function test_requiresOptIn() public {
        _cross();
        vm.prank(bob);
        setoff.setFxPreference(address(usdc), address(eurc), 0.93e6);
        Setoff.Conversion[] memory fx = _fx(10e6, 10.7e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.FxNotAllowed.selector, alice, address(eurc), address(usdc)));
        _settle(fx);
    }

    function test_rateBelowMinimumRejected() public {
        _cross();
        _optIn(1.08e6, 0.9e6); // alice wants at least 1.08 USDC per EURC
        Setoff.Conversion[] memory fx = _fx(10e6, 10.7e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.FxRateTooLow.selector, alice, uint256(1.07e6), uint256(1.08e6)));
        _settle(fx);
    }

    function test_mustBalancePerToken() public {
        _cross();
        _optIn(1e6, 0.9e6);
        Setoff.Conversion[] memory fx = _fx(10e6, 10.7e6);
        fx[1].buyAmount = 9.9e6; // bob buys less EURC than alice sold
        vm.expectRevert(abi.encodeWithSelector(Setoff.FxUnbalanced.selector, address(usdc)));
        vm.prank(carol);
        setoff.settle(ids, amts, _sorted(alice, bob, carol), _noDraws(), _withBobSell(fx, 10.6e6));
    }

    function _withBobSell(Setoff.Conversion[] memory fx, uint128 a) internal pure returns (Setoff.Conversion[] memory) {
        fx[1].sellAmount = a;
        return fx;
    }

    function test_cannotConvertDeposits() public {
        // carol has a deposit and opted in, but no leftover: she can't be made to convert it
        vm.startPrank(carol);
        setoff.deposit(address(eurc), 50e6);
        setoff.setFxPreference(address(eurc), address(usdc), 1e6);
        vm.stopPrank();
        _cross();
        _optIn(1e6, 0.9e6);
        Setoff.Conversion[] memory fx = new Setoff.Conversion[](2);
        fx[0] = Setoff.Conversion(carol, address(eurc), address(usdc), 10e6, 10.7e6);
        fx[1] = Setoff.Conversion(bob, address(usdc), address(eurc), 10.7e6, 10e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.FxExceedsNet.selector, carol));
        _settle(fx);
    }

    function test_optOut() public {
        _cross();
        _optIn(1e6, 0.9e6);
        vm.prank(alice);
        setoff.setFxPreference(address(eurc), address(usdc), 0);
        assertEq(setoff.fxMinRate(alice, address(eurc), address(usdc)), 0);
        Setoff.Conversion[] memory fx = _fx(10e6, 10.7e6);
        vm.expectRevert(abi.encodeWithSelector(Setoff.FxNotAllowed.selector, alice, address(eurc), address(usdc)));
        _settle(fx);
    }

    function test_sameTokenRejected() public {
        vm.expectRevert(abi.encodeWithSelector(Setoff.UnsupportedToken.selector, address(usdc)));
        setoff.setFxPreference(address(usdc), address(usdc), 1e6);
    }
}
