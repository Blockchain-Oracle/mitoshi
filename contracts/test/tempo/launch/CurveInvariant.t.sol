// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ITIP20} from "tempo-std/interfaces/ITIP20.sol";
import {SqrtPriceMath} from "v4-core/libraries/SqrtPriceMath.sol";
import {LaunchBase} from "./LaunchBase.sol";
import {CurveLaunchpad} from "../../../src/launch/CurveLaunchpad.sol";
import {ConfigParams, Segment, Launch, LaunchState, Config} from "../../../src/launch/CurveTypes.sol";

/// Random buys, sells, time and fee claims from five traders on a three-segment launch, then graduation once it is
/// Complete.
contract CurveHandler is Test {
    ITIP20 constant PATH_USD = ITIP20(0x20C0000000000000000000000000000000000000);
    CurveLaunchpad immutable pad;
    address immutable token;
    address[] actors;
    address[] claimers;
    uint256 public buys;
    uint256 public sells;
    uint256 public graduated;

    constructor(CurveLaunchpad pad_, address token_, address[] memory actors_, address[] memory claimers_) {
        pad = pad_;
        token = token_;
        actors = actors_;
        claimers = claimers_;
    }

    function buy(uint256 who, uint256 quote) external {
        address a = actors[who % actors.length];
        quote = bound(quote, 1, 150e6); // ≈ 35+ buys to Complete, so most of a run is trading
        vm.startPrank(a);
        PATH_USD.approve(address(pad), quote);
        try pad.buy(token, quote, 0) {
            buys++;
        } catch {}
        vm.stopPrank();
    }

    function sell(uint256 who, uint256 fraction) external {
        address a = actors[who % actors.length];
        uint256 held = ITIP20(token).balanceOf(a);
        if (held == 0) return;
        uint256 amount = bound(fraction, 1, 10_000) == 10_000 ? held : held * bound(fraction, 1, 10_000) / 10_000;
        if (amount == 0) return;
        vm.startPrank(a);
        ITIP20(token).approve(address(pad), amount);
        try pad.sell(token, amount, 0) {
            sells++;
        } catch {}
        vm.stopPrank();
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 600));
    }

    function claim(uint256 who) external {
        address c = claimers[who % claimers.length];
        if (pad.feesOwed(c) == 0) return;
        vm.prank(c);
        pad.claimFees();
    }

    function graduate() external {
        if (uint8(pad.getLaunch(token).state) != uint8(LaunchState.Complete)) return;
        pad.graduate(token);
        graduated++;
    }

    function actorList() external view returns (address[] memory) {
        return actors;
    }
}

/// Plan B.6 `CurveInvariant.t.sol`: reserve vs integral, supply == sold, the launchpad's pathUSD == reserves + fees
/// owed, and — after every run — every holder can sell everything back (the curve is always solvent).
contract CurveInvariantTest is LaunchBase {
    CurveHandler handler;
    address token;
    uint32 id;
    uint160[3] uppers;
    uint128[3] liqs;

    function setUp() public override {
        super.setUp();
        ConfigParams memory p = _params();
        Segment[] memory segs = new Segment[](3);
        uppers = [uint160(SQRT_START * 2), uint160(SQRT_START * 3), uint160(SQRT_START * 5)];
        liqs = [uint128(1_000_000_000_000), uint128(1_500_000_000_000), uint128(2_000_000_000_000)];
        for (uint256 i; i < 3; i++) segs[i] = Segment(uppers[i], liqs[i]);
        p.segments = segs;
        p.migrationQuoteThreshold = 5_000e6;
        vm.prank(partner);
        id = pad.createConfig(p);
        token = _launch(id, "INVT");
        address[] memory actors = new address[](5);
        for (uint256 i; i < 5; i++) {
            actors[i] = makeAddr(string.concat("trader", vm.toString(i)));
            PATH_USD.transfer(actors[i], 50_000e6);
        }
        address[] memory claimers = new address[](3);
        (claimers[0], claimers[1], claimers[2]) = (treasury, partner, creator);
        handler = new CurveHandler(pad, token, actors, claimers);
        targetContract(address(handler));
    }

    /// pathUSD a buyer must have paid to move the price from the start to `sqrtP` (rounded down).
    function _integral(uint160 sqrtP) internal view returns (uint256 q) {
        uint160 lower = SQRT_START;
        for (uint256 i; i < 3 && sqrtP > lower; i++) {
            uint160 top = sqrtP < uppers[i] ? sqrtP : uppers[i];
            q += SqrtPriceMath.getAmount1Delta(lower, top, liqs[i], false);
            lower = uppers[i];
        }
    }

    function invariant_reserveCoversIntegral() public view {
        Launch memory l = pad.getLaunch(token);
        if (l.state == LaunchState.Graduated) return;
        assertGe(l.quoteReserve, _integral(l.sqrtPriceX96));
    }

    function invariant_supplyEqualsSold() public view {
        Launch memory l = pad.getLaunch(token);
        if (l.state == LaunchState.Graduated) {
            assertEq(ITIP20(token).totalSupply(), pad.getConfig(id).totalSupply, "fixed at the cap after graduation");
            return;
        }
        assertEq(ITIP20(token).totalSupply(), l.coinSold);
        assertLe(l.coinSold, pad.getConfig(id).curveSupply);
    }

    function invariant_balanceCoversReservesAndFees() public view {
        (uint256 reserve, uint256 owed) = pad.totals();
        assertEq(PATH_USD.balanceOf(address(pad)), reserve + owed);
        Launch memory l = pad.getLaunch(token);
        assertEq(reserve, l.state == LaunchState.Graduated ? 0 : l.quoteReserve);
    }

    /// Solvency: while trading, everyone sells everything and the reserve pays every one of them. A holding worth
    /// less than one base unit of pathUSD after the fee is refused (`Slippage(0, 0)`: selling would pay nothing), so
    /// such dust stays sold; everything else comes back and the books still balance.
    function afterInvariant() public {
        Launch memory l = pad.getLaunch(token);
        if (l.state != LaunchState.Trading) return;
        address[] memory actors = handler.actorList();
        uint256 dust;
        for (uint256 i; i < actors.length; i++) {
            uint256 held = ITIP20(token).balanceOf(actors[i]);
            if (held == 0) continue;
            (uint256 out,) = pad.quoteSell(token, held);
            if (out == 0) {
                dust += held;
                continue;
            }
            vm.startPrank(actors[i]);
            ITIP20(token).approve(address(pad), held);
            assertEq(pad.sell(token, held, out), out);
            vm.stopPrank();
        }
        l = pad.getLaunch(token);
        assertEq(l.coinSold, dust);
        assertEq(ITIP20(token).totalSupply(), dust);
        assertLt(dust, 1e6, "only dust (< 1 coin) is left unsold");
        (uint256 reserve, uint256 owed) = pad.totals();
        assertEq(PATH_USD.balanceOf(address(pad)), reserve + owed);
        assertGe(l.quoteReserve, _integral(l.sqrtPriceX96));
    }
}
