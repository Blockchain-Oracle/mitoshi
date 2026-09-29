// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {ITIP20RolesAuth} from "tempo-std/interfaces/ITIP20RolesAuth.sol";
import {ITIP403Registry} from "tempo-std/interfaces/ITIP403Registry.sol";
import {StdPrecompiles} from "tempo-std/StdPrecompiles.sol";
import {LaunchBase} from "./LaunchBase.sol";
import {CurveLaunchpad} from "../../../src/launch/CurveLaunchpad.sol";
import {CurveConfigLib} from "../../../src/launch/CurveConfigLib.sol";
import {CurveMath} from "../../../src/launch/CurveMath.sol";
import {LaunchRegistry} from "../../../src/launch/LaunchRegistry.sol";
import {ConfigParams, Config, Launch, LaunchState, Segment} from "../../../src/launch/CurveTypes.sol";

/// Plan B.6 `CurveLaunchpad.t.sol`: config validation, currency guard, token setup, anti-snipe, trading, fees,
/// receive-policy pre-checks, completion. Graduation lives in `CurveGraduation.t.sol`.
contract CurveLaunchpadTest is LaunchBase {
    // ── createConfig ──────────────────────────────────────────────────────────────────────────────────────────────

    function test_config_derivesEndSupplyAndMigrationCoin() public {
        uint32 id = _config();
        Config memory c = pad.getConfig(id);
        assertEq(c.partner, partner);
        assertEq(c.sqrtEndX96, 268912488726092264686672459, "same as curve.ts");
        assertEq(c.curveSupply, 1473121662916969);
        assertEq(c.migrationQuoteThreshold, THRESHOLD);
        assertEq(c.migrationCoinAmount, 428809276910049);
        assertEq(pad.getSegments(id).length, 1);
    }

    function _expectConfigRevert(ConfigParams memory p, bytes4 sel) internal {
        vm.expectRevert(sel);
        vm.prank(partner);
        pad.createConfig(p);
    }

    function test_config_refusals() public {
        ConfigParams memory p = _params();
        p.partnerShareBps = 3_001;
        _expectConfigRevert(p, CurveConfigLib.BadShares.selector);
        p = _params();
        (p.protocolShareBps, p.creatorShareBps) = (1_000, 6_000); // under the 20 % protocol floor
        _expectConfigRevert(p, CurveConfigLib.BadShares.selector);
        p = _params();
        p.split.creatorVesting = 2_999;
        _expectConfigRevert(p, CurveConfigLib.BadSplit.selector);
        p = _params();
        (p.split.partnerLocked, p.split.creatorLocked, p.split.creatorUnlocked) = (400, 500, 4_100); // 9 % locked
        _expectConfigRevert(p, CurveConfigLib.BadSplit.selector);
        p = _params();
        p.vestingDuration = 63_072_001; // > 2 years
        _expectConfigRevert(p, CurveConfigLib.BadVesting.selector);
        p = _params();
        p.vestingCliff = 31 days;
        _expectConfigRevert(p, CurveConfigLib.BadVesting.selector);
        p = _params();
        p.migrationFeeBps = 5_001;
        _expectConfigRevert(p, CurveConfigLib.BadMigrationFee.selector);
        p = _params();
        p.poolFees[1] = p.poolFees[0];
        p.tickSpacings[1] = p.tickSpacings[0];
        _expectConfigRevert(p, CurveConfigLib.BadTiers.selector);
        p = _params();
        p.leftoverReceiver = address(0);
        _expectConfigRevert(p, CurveConfigLib.ZeroLeftoverReceiver.selector);
        p = _params();
        p.fees.start = 5_001;
        _expectConfigRevert(p, CurveMath.BadFeeSchedule.selector);
        p = _params();
        p.migrationQuoteThreshold = 7_000e6; // beyond the one segment
        _expectConfigRevert(p, CurveMath.ThresholdBeyondCurve.selector);
    }

    function test_config_supplyMustCoverCurveMigrationAndCorrection() public {
        ConfigParams memory p = _params();
        p.totalSupply = 1_944_811_867_518_021; // one below curve + migration + 10 %
        vm.expectRevert(abi.encodeWithSelector(CurveConfigLib.BadSupply.selector, p.totalSupply, p.totalSupply + 1));
        vm.prank(partner);
        pad.createConfig(p);
        p.totalSupply += 1;
        vm.prank(partner);
        pad.createConfig(p);
    }

    /// A curve so cheap its flipped v4 price (coin per pathUSD) is beyond v4's range: refused before any launch.
    function test_config_endPriceMustFitEveryTier() public {
        ConfigParams memory p = _params();
        p.sqrtStartX96 = 1 << 30; // price 2^-132 pathUSD per coin → v4 sqrt 2^162 > MAX_SQRT_PRICE
        p.segments[0] = Segment(1 << 31, uint128(THRESHOLD << 66));
        _expectConfigRevert(p, CurveConfigLib.EndPriceOutOfRange.selector);
        // And one inside uint160 but beyond one tier's usable ticks: end sqrt 2^33 → v4 sqrt 2^159, tick ≈ 873,365.
        p = _params();
        p.sqrtStartX96 = 1 << 32;
        p.segments[0] = Segment(1 << 33, uint128(THRESHOLD << 64));
        p.tickSpacings[2] = 30_000; // max usable tick 870,000
        _expectConfigRevert(p, CurveConfigLib.EndPriceOutOfRange.selector);
    }

    // ── createLaunch ──────────────────────────────────────────────────────────────────────────────────────────────

    function test_launch_tokenSetup() public {
        uint32 id = _config();
        address token = _launch(id, "MEOW");
        ITIP20 t = ITIP20(token);
        assertTrue(StdPrecompiles.TIP20_FACTORY.isTIP20(token));
        assertEq(t.currency(), "MEOW", "currency = symbol");
        assertEq(address(t.quoteToken()), address(PATH_USD));
        assertEq(t.transferPolicyId(), pad.curvePolicyId(), "curve policy");
        assertEq(t.supplyCap(), 2_000_000_000e6);
        assertEq(t.totalSupply(), 0);
        assertTrue(ITIP20RolesAuth(token).hasRole(address(pad), bytes32(0)), "launchpad is admin");
        assertTrue(ITIP20RolesAuth(token).hasRole(address(pad), t.ISSUER_ROLE()), "launchpad is issuer");
        assertFalse(ITIP20RolesAuth(token).hasRole(creator, bytes32(0)), "creator has no power over the coin");
        Launch memory l = pad.getLaunch(token);
        assertEq(uint8(l.state), uint8(LaunchState.Trading));
        assertEq(l.creator, creator);
        assertEq(l.sqrtPriceX96, SQRT_START);
        LaunchRegistry.Launch memory r = registry.launchOf(token);
        assertEq(uint8(r.kind), uint8(LaunchRegistry.Kind.Memecoin));
        assertEq(r.creator, creator);
        (uint64 s, uint64 rec, uint64 mint) = StdPrecompiles.TIP403_REGISTRY.compoundPolicyData(pad.curvePolicyId());
        assertEq(s, 1);
        assertEq(rec, pad.poolManagerBlacklistId());
        assertEq(mint, pad.poolManagerBlacklistId(), "D-095: mint recipients refuse the PoolManager too");
    }

    function test_launch_currencyGuard() public {
        uint32 id = _config();
        string[4] memory reserved = ["EUR", "TSLA", "usd", "NVDA"];
        for (uint256 i; i < reserved.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.ReservedCode.selector, reserved[i]));
            vm.prank(creator);
            pad.createLaunch(id, "X", reserved[i], "", "", bytes32(i), 0, 0);
        }
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.UnknownConfig.selector, uint32(9)));
        pad.createLaunch(9, "X", "OKAY", "", "", 0, 0, 0);
    }

    function test_launch_saltIsPerCreator() public {
        uint32 id = _config();
        vm.prank(creator);
        address a = pad.createLaunch(id, "A", "AAAA", "", "", bytes32("s"), 0, 0);
        vm.prank(alice);
        address b = pad.createLaunch(id, "A", "AAAA", "", "", bytes32("s"), 0, 0);
        assertTrue(a != b, "the same salt from another creator is another address");
    }

    function test_launch_creatorBuy_atBaseFee_capped() public {
        uint32 id = _config();
        vm.startPrank(creator);
        PATH_USD.approve(address(pad), 50e6);
        address token = pad.createLaunch(id, "C", "CBUY", "", "", 0, 50e6, 1);
        vm.stopPrank();
        uint256 coin = ITIP20(token).balanceOf(creator);
        assertGt(coin, 0);
        // 1 % base fee (not the 50 % anti-snipe start): creator 50 %, partner 30 %, protocol 20 % of 0.5 pathUSD.
        assertEq(pad.feesOwed(treasury), 100_000);
        assertEq(pad.feesOwed(partner), 150_000);
        assertEq(pad.feesOwed(creator), 250_000);
        vm.startPrank(creator);
        PATH_USD.approve(address(pad), 1_000e6);
        vm.expectPartialRevert(CurveLaunchpad.CreatorBuyTooLarge.selector);
        pad.createLaunch(id, "C", "CBIG", "", "", bytes32("2"), 1_000e6, 1);
        vm.stopPrank();
    }

    // ── trading ───────────────────────────────────────────────────────────────────────────────────────────────────

    function test_antiSnipe_feeDecays_andIsCharged() public {
        address token = _launch(_config(), "SNIP");
        assertEq(pad.currentFeeBps(token), 5_000);
        (uint256 coinQuoted, uint256 paidQuoted, uint256 feeQuoted) = pad.quoteBuy(token, 100e6);
        (uint256 coin, uint256 paid) = _buy(alice, token, 100e6);
        assertEq(coin, coinQuoted, "quoteBuy == buy");
        assertEq(paid, paidQuoted);
        assertEq(feeQuoted, 50e6, "half goes to fees at t0");
        vm.warp(block.timestamp + 25);
        assertEq(pad.currentFeeBps(token), 5_000 - 2 * 490);
        vm.warp(block.timestamp + 1_000);
        assertEq(pad.currentFeeBps(token), 100);
    }

    function test_buy_sell_accounting() public {
        address token = _launch(_config(), "TRDE");
        vm.warp(block.timestamp + 1 hours);
        uint256 before = PATH_USD.balanceOf(alice);
        (uint256 coin, uint256 paid) = _buy(alice, token, 1_000e6);
        assertEq(PATH_USD.balanceOf(alice), before - paid);
        assertEq(ITIP20(token).balanceOf(alice), coin);
        Launch memory l = pad.getLaunch(token);
        assertEq(l.quoteReserve, paid - CurveMath.feeOn(paid, 100));
        assertEq(l.coinSold, coin);
        assertEq(ITIP20(token).totalSupply(), coin, "supply == sold");

        (uint256 outQuoted, uint256 feeQuoted) = pad.quoteSell(token, coin / 2);
        uint256 out = _sell(alice, token, coin / 2);
        assertEq(out, outQuoted, "quoteSell == sell");
        assertGt(feeQuoted, 0);
        assertEq(ITIP20(token).totalSupply(), coin - coin / 2, "sell burns");
        (uint256 reserve, uint256 owed) = pad.totals();
        assertEq(PATH_USD.balanceOf(address(pad)), reserve + owed, "the launchpad holds exactly reserves + fees");
    }

    function test_roundTrip_losesOnlyFees() public {
        address token = _launch(_config(), "RTRP");
        vm.warp(block.timestamp + 1 hours);
        (uint256 coin, uint256 paid) = _buy(alice, token, 500e6);
        uint256 out = _sell(alice, token, coin);
        assertLt(out, paid);
        assertApproxEqRel(out, paid * 9_900 / 10_000 * 9_900 / 10_000, 1e14);
        uint160 p = pad.getLaunch(token).sqrtPriceX96;
        assertGe(p, SQRT_START, "rounding leaves the price at or just above the start");
        assertApproxEqRel(p, SQRT_START, 1e12);
    }

    function test_slippage_andState() public {
        address token = _launch(_config(), "SLIP");
        vm.startPrank(alice);
        PATH_USD.approve(address(pad), 10e6);
        vm.expectPartialRevert(CurveLaunchpad.Slippage.selector);
        pad.buy(token, 10e6, type(uint256).max);
        vm.expectRevert(CurveLaunchpad.ZeroTrade.selector);
        pad.sell(token, 0, 0);
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotTrading.selector, address(0xdead)));
        pad.buy(address(0xdead), 1, 0);
    }

    function test_sellNeedsAllowance() public {
        address token = _launch(_config(), "ALLW");
        (uint256 coin,) = _buy(alice, token, 50e6);
        vm.prank(alice);
        vm.expectRevert();
        pad.sell(token, coin, 0);
    }

    function test_complete_clipsAndStopsTrading() public {
        address token = _launch(_config(), "DONE");
        vm.warp(block.timestamp + 1 hours);
        (uint256 coin, uint256 paid) = _buy(whale, token, 20_000e6);
        Launch memory l = pad.getLaunch(token);
        assertEq(uint8(l.state), uint8(LaunchState.Complete));
        assertLt(paid, 20_000e6, "clipped: charged for what the curve took");
        assertGe(l.quoteReserve, THRESHOLD);
        assertLe(coin, pad.getConfig(1).curveSupply);
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotTrading.selector, token));
        pad.buy(token, 1e6, 0);
        vm.startPrank(whale);
        ITIP20(token).approve(address(pad), 1);
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.NotTrading.selector, token));
        pad.sell(token, 1, 0);
        vm.stopPrank();
    }

    function test_preGraduation_coinCannotReachThePoolManager() public {
        address token = _launch(_config(), "NOPM");
        (uint256 coin,) = _buy(alice, token, 50e6);
        vm.prank(alice);
        vm.expectRevert(ITIP20.PolicyForbids.selector);
        ITIP20(token).transfer(address(pm), coin);
        vm.prank(alice);
        ITIP20(token).transfer(bob, coin); // ordinary transfers work
    }

    // ── fees and pre-checks ───────────────────────────────────────────────────────────────────────────────────────

    function test_claimFees_paysCallerOnly() public {
        address token = _launch(_config(), "FEES");
        vm.warp(block.timestamp + 1 hours);
        _buy(alice, token, 1_000e6); // 10 pathUSD fee
        assertEq(pad.feesOwed(creator), 5e6);
        uint256 before = PATH_USD.balanceOf(creator);
        vm.prank(creator);
        assertEq(pad.claimFees(), 5e6);
        assertEq(PATH_USD.balanceOf(creator), before + 5e6);
        vm.prank(creator);
        vm.expectRevert(CurveLaunchpad.NothingToClaim.selector);
        pad.claimFees();
        vm.prank(treasury);
        assertEq(pad.claimFees(), 2e6);
    }

    /// TIP-1028: a buyer whose receive policy refuses senders other than a whitelist would have the mint parked in the
    /// ReceivePolicyGuard; the launchpad refuses up front instead.
    function test_receivePolicy_preChecked() public {
        address token = _launch(_config(), "RCVP");
        ITIP403Registry reg = StdPrecompiles.TIP403_REGISTRY;
        address[] memory only = new address[](1);
        only[0] = bob;
        vm.startPrank(alice);
        uint64 wl = reg.createPolicyWithAccounts(alice, ITIP403Registry.PolicyType.WHITELIST, only);
        reg.setReceivePolicy(wl, 1, alice);
        PATH_USD.approve(address(pad), 10e6);
        vm.expectRevert(abi.encodeWithSelector(CurveLaunchpad.ReceivePolicyBlocks.selector, token, alice));
        pad.buy(token, 10e6, 0);
        vm.stopPrank();
    }

    function test_owner_setters() public {
        vm.expectRevert();
        vm.prank(alice);
        pad.setProtocolTreasury(alice);
        pad.setProtocolTreasury(bob);
        assertEq(pad.protocolTreasury(), bob);
        vm.expectRevert(CurveLaunchpad.BadShare.selector);
        pad.setMinProtocolShare(10_001);
        pad.setMinProtocolShare(0);
        ConfigParams memory p = _params();
        (p.protocolShareBps, p.creatorShareBps) = (0, 7_000);
        vm.prank(partner);
        pad.createConfig(p);
    }
}
