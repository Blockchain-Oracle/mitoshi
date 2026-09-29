// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {LaunchBase} from "./LaunchBase.sol";
import {LiquidityLocker} from "../../../src/launch/LiquidityLocker.sol";
import {LpSplit} from "../../../src/launch/CurveTypes.sol";

/// Plan B.6 `LiquidityLocker.t.sol`: the graduated position's six buckets — unlocked now, locked never, vesting
/// linearly after the cliff — LP fees pro rata to the liquidity each party still has, payouts to the caller only.
contract LiquidityLockerTest is LaunchBase {
    address token;
    uint128 liq;

    function setUp() public override {
        super.setUp();
        token = _launch(_config(), "LOCK");
        _complete(token);
        pad.graduate(token);
        liq = pad.getGraduation(token).liquidity;
    }

    function test_register_onlyLaunchpad_once() public {
        LpSplit memory s;
        vm.expectRevert(abi.encodeWithSelector(LiquidityLocker.NotLaunchpad.selector, address(this)));
        locker.register(token, 1, 1, partner, creator, s, 0, 0);
        vm.prank(address(pad));
        vm.expectRevert(abi.encodeWithSelector(LiquidityLocker.AlreadyRegistered.selector, token));
        locker.register(token, 1, 1, partner, creator, s, 0, 0);
        vm.expectRevert(LiquidityLocker.LaunchpadAlreadySet.selector);
        locker.setLaunchpad(alice);
    }

    function test_unlocked_withdrawsNow_toCallerOnly() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLocker.NotBucketOwner.selector, alice, LiquidityLocker.Bucket.CreatorUnlocked));
        locker.withdraw(token, LiquidityLocker.Bucket.CreatorUnlocked);

        uint128 amount = locker.withdrawable(token, LiquidityLocker.Bucket.CreatorUnlocked);
        assertEq(amount, uint128(uint256(liq) * 2_000 / 10_000));
        uint256 q0 = PATH_USD.balanceOf(creator);
        uint256 c0 = ITIP20(token).balanceOf(creator);
        vm.prank(creator);
        (uint256 quote, uint256 coin) = locker.withdraw(token, LiquidityLocker.Bucket.CreatorUnlocked);
        assertGt(quote, 0);
        assertGt(coin, 0);
        assertEq(PATH_USD.balanceOf(creator) - q0, quote);
        assertEq(ITIP20(token).balanceOf(creator) - c0, coin);
        assertEq(POSM.getPositionLiquidity(pad.getGraduation(token).positionId), liq - amount);
        vm.prank(creator);
        vm.expectRevert(LiquidityLocker.NothingToWithdraw.selector);
        locker.withdraw(token, LiquidityLocker.Bucket.CreatorUnlocked);
    }

    function test_locked_never() public {
        vm.warp(block.timestamp + 3650 days);
        assertEq(locker.withdrawable(token, LiquidityLocker.Bucket.PartnerLocked), 0);
        vm.prank(partner);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLocker.BucketLocked.selector, LiquidityLocker.Bucket.PartnerLocked));
        locker.withdraw(token, LiquidityLocker.Bucket.PartnerLocked);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLocker.BucketLocked.selector, LiquidityLocker.Bucket.CreatorLocked));
        locker.withdraw(token, LiquidityLocker.Bucket.CreatorLocked);
    }

    function test_vesting_cliffThenLinear() public {
        uint256 allotted = uint256(liq) * 3_000 / 10_000;
        vm.warp(block.timestamp + 1 days - 1);
        assertEq(locker.withdrawable(token, LiquidityLocker.Bucket.CreatorVesting), 0, "before the cliff");
        vm.warp(block.timestamp + 1 + 14 days); // 15 of 30 days
        assertEq(locker.withdrawable(token, LiquidityLocker.Bucket.CreatorVesting), uint128(allotted * 15 days / 30 days));
        vm.prank(creator);
        locker.withdraw(token, LiquidityLocker.Bucket.CreatorVesting);
        vm.warp(block.timestamp + 30 days);
        assertEq(locker.withdrawable(token, LiquidityLocker.Bucket.CreatorVesting), uint128(allotted - allotted * 15 days / 30 days));
    }

    function test_fees_proRata_andClaimedByCaller() public {
        vm.startPrank(bob);
        PATH_USD.approve(address(swapper), 2_000e6);
        uint256 coin = swapper.swap(_key(token, 0), true, 2_000e6);
        ITIP20(token).approve(address(swapper), coin);
        swapper.swap(_key(token, 0), false, coin);
        vm.stopPrank();

        uint256 q0 = PATH_USD.balanceOf(partner);
        vm.prank(partner);
        (uint256 pq, uint256 pc) = locker.claimFees(token);
        (uint256 cq, uint256 cc) = (0, 0);
        (cq, cc) = locker.feesOwed(token, creator);
        assertGt(pq, 0, "1 % pool fee on 2,000 pathUSD");
        assertGt(pc, 0);
        assertEq(PATH_USD.balanceOf(partner) - q0, pq);
        // Partner has 30 % of the liquidity, creator 70 %.
        assertApproxEqRel(cq, pq * 7 / 3, 1e15);
        assertApproxEqRel(cc, pc * 7 / 3, 1e15);
        vm.prank(alice);
        vm.expectRevert(LiquidityLocker.NothingToClaim.selector);
        locker.claimFees(token);
    }

    function test_receivePolicy_preChecked() public {
        ITIP403Registry reg = StdPrecompiles.TIP403_REGISTRY;
        address[] memory none = new address[](1);
        none[0] = bob;
        vm.startPrank(creator);
        uint64 wl = reg.createPolicyWithAccounts(creator, ITIP403Registry.PolicyType.WHITELIST, none);
        reg.setReceivePolicy(wl, 1, creator);
        vm.expectRevert(abi.encodeWithSelector(LiquidityLocker.ReceivePolicyBlocks.selector, address(PATH_USD), creator));
        locker.withdraw(token, LiquidityLocker.Bucket.CreatorUnlocked);
        vm.stopPrank();
    }
}
