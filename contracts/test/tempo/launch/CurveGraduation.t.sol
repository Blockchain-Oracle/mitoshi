// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {LaunchBase} from "./LaunchBase.sol";
import {CurveLaunchpad} from "../../../src/launch/CurveLaunchpad.sol";
import {CurveGraduationLib} from "../../../src/launch/CurveGraduationLib.sol";
import {CurveConfigLib} from "../../../src/launch/CurveConfigLib.sol";
import {LiquidityLocker} from "../../../src/launch/LiquidityLocker.sol";
import {Launch, LaunchState, Graduation, Config} from "../../../src/launch/CurveTypes.sol";

/// Plan B.6 `CurveLaunchpad.t.sol` (graduation half): permissionless graduate into a hookless v4 pool on the real
/// PoolManager/PositionManager runtimes, the policy flip, roles renounced, leftover, fees, and the poisoned-pool cases
/// (a squatter pre-initialises the migration pool, with or without pathUSD liquidity, on one or every tier).
contract CurveGraduationTest is LaunchBase {

    address attacker = makeAddr("attacker");
    uint32 id;
    address token;

    function setUp() public override {
        super.setUp();
        PATH_USD.transfer(attacker, 100_000e6);
        id = _config();
        token = _launch(id, "GRAD");
        vm.warp(block.timestamp + 1 hours);
        _buy(alice, token, 1_000e6);
    }

    function _target() internal view returns (uint160) {
        return CurveConfigLib.v4SqrtPrice(pad.getConfig(id).sqrtEndX96);
    }

    function _sqrt(uint8 tier) internal view returns (uint160 s) {
        (s,,,) = StateLibrary.getSlot0(pm, _key(token, tier).toId());
    }

    function test_graduate_onlyWhenComplete() public {
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotComplete.selector, token));
        pad.graduate(token);
    }

    function test_graduate_happyPath() public {
        _complete(token);
        Launch memory l = pad.getLaunch(token);
        (uint256 reserveBefore, uint256 owedBefore) = pad.totals();
        uint256 treasuryBefore = pad.feesOwed(treasury);

        vm.prank(keeper); // permissionless
        uint256 positionId = pad.graduate(token);

        Graduation memory g = pad.getGraduation(token);
        Config memory c = pad.getConfig(id);
        assertEq(uint8(pad.getLaunch(token).state), uint8(LaunchState.Graduated));
        assertEq(g.tier, 0);
        assertEq(g.positionId, positionId);
        assertEq(POSM.ownerOf(positionId), address(locker), "locker holds the NFT");
        assertEq(POSM.getPositionLiquidity(positionId), g.liquidity);
        assertEq(_sqrt(0), _target(), "pool at the discovered price (frame-flipped)");
        assertEq(ITIP20(token).transferPolicyId(), 1, "policy flipped to always-allow");
        assertFalse(ITIP20RolesAuth(token).hasRole(address(pad), ITIP20(token).ISSUER_ROLE()), "issuer renounced");
        assertFalse(ITIP20RolesAuth(token).hasRole(address(pad), bytes32(0)), "admin renounced");
        assertEq(ITIP20(token).totalSupply(), c.totalSupply, "fixed supply: minted to the cap");
        assertEq(pad.feesOwed(treasury) - treasuryBefore, l.quoteReserve * 20 / 10_000, "0.2 % protocol migration fee");

        // Books: the reserve left, fees owed grew, and the launchpad holds exactly what it owes.
        (uint256 reserveAfter, uint256 owedAfter) = pad.totals();
        assertEq(reserveBefore - reserveAfter, l.quoteReserve);
        assertGt(owedAfter, owedBefore);
        assertEq(PATH_USD.balanceOf(address(pad)), reserveAfter + owedAfter);
        assertEq(ITIP20(token).balanceOf(address(pad)), g.leftover, "only the leftover coin stays");

        // Leftover: only the receiver, once.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotLeftoverReceiver.selector, alice));
        pad.claimLeftover(token);
        vm.prank(leftoverReceiver);
        assertEq(pad.claimLeftover(token), g.leftover);
        assertEq(ITIP20(token).balanceOf(leftoverReceiver), g.leftover);
        vm.prank(leftoverReceiver);
        vm.expectRevert(CurveLaunchpad.NothingToClaim.selector);
        pad.claimLeftover(token);

        // The pool trades both ways; nobody can mint any more.
        vm.startPrank(bob);
        PATH_USD.approve(address(swapper), 100e6);
        uint256 coinOut = swapper.swap(_key(token, 0), true, 100e6);
        assertGt(coinOut, 0);
        ITIP20(token).approve(address(swapper), coinOut);
        assertGt(swapper.swap(_key(token, 0), false, coinOut), 0);
        vm.stopPrank();
        vm.expectRevert();
        vm.prank(address(pad));
        ITIP20(token).mint(alice, 1);

        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotComplete.selector, token));
        pad.graduate(token);
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotTrading.selector, token));
        pad.buy(token, 1e6, 0);
    }

    // ── poisoned pools ────────────────────────────────────────────────────────────────────────────────────────────

    function _initPool(uint8 tier, uint160 sqrtPrice) internal {
        vm.prank(attacker);
        POSM.initializePool(_lite(_key(token, tier)), sqrtPrice);
    }

    /// The squatter adds pathUSD-only liquidity above its (too low) price — the only liquidity the curve policy allows.
    function _addPathUsdLiquidity(uint8 tier, uint256 amount) internal {
        PoolKey memory key = _key(token, tier);
        int24 ts = key.tickSpacing;
        (, int24 tick,,) = StateLibrary.getSlot0(pm, key.toId());
        int24 lower = (tick / ts + 1) * ts;
        int24 upper = (TickMath.getTickAtSqrtPrice(_target()) / ts) * ts;
        uint128 liq = LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), amount);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(key, lower, upper, uint256(liq), uint128(amount), uint128(0), attacker, bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        vm.startPrank(attacker);
        PATH_USD.approve(address(PERMIT2), amount);
        PERMIT2.approve(address(PATH_USD), address(POSM), uint160(amount), uint48(block.timestamp + 1));
        POSM.modifyLiquidities(abi.encode(abi.encodePacked(uint8(0x02), uint8(0x0d)), params), block.timestamp);
        vm.stopPrank();
    }

    /// v4 price 1,000 coin per pathUSD (the coin 87× dearer than the curve's end): needs coin sold in to fix.
    uint160 constant LOW = 2505414483750479311864138015696; // √1000 · 2^96

    function test_poisoned_lowPrice_noLiquidity_corrected() public {
        _initPool(0, LOW);
        _complete(token);
        pad.graduate(token);
        assertEq(pad.getGraduation(token).tier, 0, "same tier, corrected");
        assertEq(_sqrt(0), _target());
    }

    function test_poisoned_highPrice_correctedForFree() public {
        _initPool(0, _target() * 3);
        _complete(token);
        uint256 padPathBefore = PATH_USD.balanceOf(address(pad));
        pad.graduate(token);
        assertEq(pad.getGraduation(token).tier, 0);
        assertEq(_sqrt(0), _target());
        // Lowering the price crossed no liquidity, so the correction cost no pathUSD (only the position took some).
        assertGt(PATH_USD.balanceOf(address(pad)), 0);
        assertLt(PATH_USD.balanceOf(address(pad)), padPathBefore);
    }

    function test_poisoned_withPathUsdLiquidity_squatterPays() public {
        _initPool(0, LOW);
        _addPathUsdLiquidity(0, 200e6);
        _complete(token);
        uint256 creatorOwed = pad.feesOwed(creator);
        pad.graduate(token);
        assertEq(pad.getGraduation(token).tier, 0);
        assertEq(_sqrt(0), _target());
        // The squatter's pathUSD was bought with coin at worse-than-curve prices; the proceeds beyond what the
        // position takes land with partner/creator.
        assertGt(pad.feesOwed(creator) - creatorOwed, 50e6);
    }

    function test_poisoned_deep_fallsBackToNextTier() public {
        _initPool(0, LOW);
        _addPathUsdLiquidity(0, 10_000e6); // correcting would need > 10 % of the migration coin
        _complete(token);
        vm.recordLogs();
        pad.graduate(token);
        assertEq(pad.getGraduation(token).tier, 1, "backup tier");
        assertEq(_sqrt(1), _target());
        assertEq(_sqrt(0), LOW, "the poisoned pool is left alone (the failed correction rolled back)");
        // Tier 0 was skipped because the budget ran out before the target (not for any other reason).
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 skipped = keccak256("TierSkipped(address,uint8,bytes)");
        uint256 seen;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] != skipped) continue;
            (uint8 tier, bytes memory reason) = abi.decode(logs[i].data, (uint8, bytes));
            assertEq(tier, 0);
            assertEq(bytes4(reason), CurveGraduationLib.CorrectionShort.selector);
            seen++;
        }
        assertEq(seen, 1);
    }

    function test_poisoned_allTiers_reverts_andStaysComplete() public {
        for (uint8 t; t < 3; t++) {
            _initPool(t, LOW);
            _addPathUsdLiquidity(t, 10_000e6);
        }
        _complete(token);
        vm.expectRevert(abi.encodeWithSelector(CurveGraduationLib.PoolPoisoned.selector, token));
        pad.graduate(token);
        assertEq(uint8(pad.getLaunch(token).state), uint8(LaunchState.Complete));
        assertEq(ITIP20(token).transferPolicyId(), pad.curvePolicyId(), "nothing changed");
    }

    function test_poisoned_squatterCannotSeedCoinSide() public {
        _initPool(0, LOW);
        (uint256 coin,) = _buy(bob, token, 100e6);
        vm.prank(bob);
        vm.expectRevert(ITIP20.PolicyForbids.selector);
        ITIP20(token).transfer(address(pm), coin);
    }

    function test_unlockCallback_onlyPoolManager_andOnlyWhenExpected() public {
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotPoolManager.selector, address(this)));
        pad.unlockCallback("");
        vm.prank(address(pm));
        vm.expectRevert(CurveGraduationLib.UnexpectedUnlock.selector);
        pad.unlockCallback("");
    }

    function test_locker_holdsBuckets() public {
        _complete(token);
        pad.graduate(token);
        LiquidityLocker.Lock memory k = locker.lockOf(token);
        uint128 liq = pad.getGraduation(token).liquidity;
        assertEq(k.positionId, pad.getGraduation(token).positionId);
        assertEq(k.partner, partner);
        assertEq(k.creator, creator);
        assertEq(k.allotted[1] + k.allotted[4], uint128(uint256(liq) * 3_000 / 10_000), "30 % locked");
    }
}
