// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/RangeTestBase.sol — `MockWindows`/`MockOracleHub` are retired (A.6,
// D-018): the Window is a real engine Window (a RedStone open print at P0 through `recordPrint`), its book a real
// maker's rested PostOnly levels (`BookSeeder`), and a round settles on a real RedStone close (`settle`) or a missed
// close (`voidExpired`). Same constants: P0 = 76,735.23, a 5-minute Window one minute in, 4 minutes to expiry, even
// odds on the book (YES 0.52/0.54 asks, 0.48/0.46 bids, 300 contracts a level), BTC σ 6,200 and ETH 7,800. New: the
// FairValueGuard verifying one signed spot per open (PD-2/D-119) and `setAssetTicker` in place of the hub's key.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {IRangeReserve} from "../../../src/products/range/IRangeReserve.sol";
import {RangeReserve} from "../../../src/products/range/RangeReserve.sol";
import {PrintSigner} from "../../engine/harness/PrintSigner.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {BookSeeder} from "./BookSeeder.sol";
import "../../../src/engine/EngineTypes.sol";

abstract contract RangeTestBase is BookSeeder {
    uint256 internal constant ONE = 1e6;
    uint256 internal constant SUPPLY = 1_000 * ONE;
    /// @dev 76,735.23 — the print Masayume's Window 70535 settled at live (context/43), in cents.
    int256 internal constant P0 = 7_673_523;
    int256 internal constant CENT_E8 = 1e6;
    uint64 internal constant NOW = START + 60;
    uint64 internal constant EXPIRY = START + 300;
    string internal constant BTC = "BTC";
    uint256 internal constant LEVEL = 300 * ONE;

    RangeReserve internal reserve;
    FairValueGuard internal guard;

    address internal house = makeAddr("house");
    address internal opener = makeAddr("opener");
    address internal stranger = makeAddr("stranger");

    bytes32 internal marketA;
    uint16 internal tickerA;
    /// The spot every open's proof carries unless a test says otherwise (the open itself: no drift).
    uint256 internal spotE8 = uint256(P0 * CENT_E8);

    function setUp() public virtual override {
        super.setUp();
        // A 5-minute Window whose open printed P0, and the fixture's own Window (another ticker) standing for ETH.
        marketA = list(START, uint40(EXPIRY), false);
        recordOpen(marketA, P0 * CENT_E8);
        tickerA = lens.marketRef(marketA).ticker;

        guard = new FairValueGuard(lens, address(this), 120);
        guard.setSpotSource(tickerA, IPrintVerifier(address(rsVerifier)), Policies.TSLA);
        reserve = new RangeReserve(IERC20(address(usd)), IEventsEngine(address(engine)), lens, guard, defaultParams());
        reserve.setVolatility(BTC, 6_200);
        reserve.setVolatility("ETH", 7_800);
        reserve.setAssetTicker(BTC, tickerA);
        reserve.setAssetTicker("ETH", lens.marketRef(m).ticker);

        setBook(marketA, 520_000, 540_000, 480_000, 460_000);
        vm.warp(NOW); // one minute in: the book has rested 60 s

        usd.mint(house, 100_000 * ONE);
        usd.mint(opener, 10_000 * ONE);
        vm.prank(house);
        usd.approve(address(reserve), type(uint256).max);
        vm.prank(opener);
        usd.approve(address(reserve), type(uint256).max);
        vm.prank(house);
        reserve.supply(SUPPLY);
    }

    /// Masayume's test params plus the D-109 rest and the D-119 2σ drift bound.
    function defaultParams() internal pure returns (IRangeReserve.Params memory) {
        return IRangeReserve.Params({
            marginBps: 1_200,
            maxExposureBps: 5_000,
            maxSpreadRaw: 200_000,
            centerDepthRaw: 20 * ONE,
            minCenterQE6: 30_000,
            maxCenterQE6: 970_000,
            minProbRaw: 20_000,
            maxProbRaw: 970_000,
            minTimeLeftSec: 60,
            maxHorizonSec: 2 days,
            staleAfterSec: 6 hours,
            maxPayoutCap: 500 * ONE,
            maxExpiryLocked: 400 * ONE,
            minRestSec: 20,
            maxDriftE4: 20_000
        });
    }

    /// Two levels a side, 300 contracts each, from the maker (PostOnly); callers `rest()` before pricing over them.
    function setBook(bytes32 mk, uint256 ask0, uint256 ask1, uint256 bid0, uint256 bid1) internal {
        clearSeeds(mk);
        restOrder(mk, KIND_BUY_NO, ask0, LEVEL);
        restOrder(mk, KIND_BUY_NO, ask1, LEVEL);
        restOrder(mk, KIND_BUY_YES, bid0, LEVEL);
        restOrder(mk, KIND_BUY_YES, bid1, LEVEL);
    }

    function restOrder(bytes32 mk, uint8 kind, uint256 priceRaw, uint256 qty) internal {
        (, uint40 lockAt) = _lockOf(mk);
        vm.prank(who(MAKER));
        engine.placeOrder(
            PlaceArgs(mk, kind, ORDER_POST_ONLY, SELF_CANCEL_TAKER, uint16(priceRaw / 1000), uint64(qty / 1000), lockAt, 16, 16, false, false, 0)
        );
    }

    function rest() internal {
        vm.warp(vm.getBlockTimestamp() + 20);
    }

    /// @dev A band of ± `usd` dollars around the opening print, in cents.
    function band(int256 usdDollars) internal pure returns (int256 low, int256 high) {
        return (P0 - usdDollars * 100, P0 + usdDollars * 100);
    }

    function spot() internal view returns (bytes memory) {
        return PrintSigner.five(Policies.TSLA, spotE8, vm.getBlockTimestamp());
    }

    function openAs(address actor, IRangeReserve.Side side, int256 low, int256 high, uint256 maxPayout) internal returns (uint256 id, uint256 stake) {
        bytes memory proof = spot();
        vm.prank(actor);
        (id, stake) = reserve.openRange(marketA, BTC, side, low, high, maxPayout, type(uint256).max, proof);
    }

    /// Settles marketA's Window on a real RedStone close at `closeCents` (e-8 = cents × 1e6), or `closeE8` exactly.
    function closeAt(int256 closeCents) internal {
        closeAtE8(closeCents * CENT_E8);
    }

    function closeAtE8(int256 closeE8) internal {
        if (vm.getBlockTimestamp() < EXPIRY) vm.warp(EXPIRY);
        recordClose(marketA, closeE8);
        engine.settle(marketA);
    }

    /// No close print: the engine voids the Window for anyone past its admission deadline (0.50 a side).
    function voidWindow() internal {
        if (vm.getBlockTimestamp() < EXPIRY + 901) vm.warp(EXPIRY + 901);
        engine.voidExpired(marketA);
    }

    /// @dev `balanceOf(reserve) == liquid + Σ escrow (LIVE, WON) + totalOwedPayouts` — the one accounting identity.
    function assertBooksBalance() internal view {
        uint256 escrow;
        uint256 n = reserve.roundCount();
        for (uint256 id = 1; id <= n; id++) {
            IRangeReserve.Round memory r = reserve.roundOf(id);
            if (r.status == IRangeReserve.RoundStatus.LIVE || r.status == IRangeReserve.RoundStatus.WON) escrow += r.stake + r.houseLocked;
        }
        assertEq(usd.balanceOf(address(reserve)), reserve.liquid() + escrow + reserve.totalOwedPayouts(), "reserve balance == liquid + live escrow + owed");
    }
}
