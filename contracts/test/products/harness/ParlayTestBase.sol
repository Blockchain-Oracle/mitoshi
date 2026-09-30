// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/ParlayTestBase.sol — `MockWindows`/`MockWindow` are retired (A.6, D-018):
// the reserve prices legs off the real engine's rested book (a real maker's PostOnly levels, `BookSeeder`) over a real
// factory-created TIP-20, and each leg settles on a real RedStone close print (`settle`) or a missed close
// (`voidExpired`). Same shape: three Windows, A settling first, B and C sharing a later instant; YES asks 0.60 then
// 0.62 and YES bids 0.58 then 0.55, 300 contracts a level. New: the PD-2 guard over the engine's open prints, one
// signed RedStone spot per leg (`spots`), and the book resting `REST` seconds before a leg may be priced (D-109).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {IParlayReserve} from "../../../src/products/parlay/IParlayReserve.sol";
import {ParlayReserve} from "../../../src/products/parlay/ParlayReserve.sol";
import {PrintSigner} from "../../engine/harness/PrintSigner.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {BookSeeder} from "./BookSeeder.sol";
import "../../../src/engine/EngineTypes.sol";

abstract contract ParlayTestBase is BookSeeder {
    uint256 internal constant ONE = 1e6;
    uint256 internal constant SUPPLY = 1_000 * ONE;
    /// The fixture's Series rest rule (`minRestSec` 20) = the reserve's launch `minRestSec`.
    uint40 internal constant REST = 20;
    uint64 internal constant EXP_A = START + 300;
    uint64 internal constant EXP_B = START + 600;
    /// σ per √s × 1e8 (4,500 bp over a trading year), the guard test's.
    uint64 internal constant SIGMA = 18_531;
    /// Every Window's open print (the fixture's 365.00).
    int256 internal constant OPEN_E8 = 36_500_000_000;
    /// A spot the book agrees with: fair P(Up) ≈ 0.56–0.60 over the suites' clocks, inside the 0.05 slack of the
    /// 0.60 ask (UP) and the 0.42 inverted bid (DOWN).
    uint256 internal constant BOOK_SPOT_E8 = 36_525_000_000;
    uint256 internal constant LEVEL = 300 * ONE;

    ParlayReserve internal reserve;
    FairValueGuard internal guard;

    address internal house = makeAddr("house");
    address internal opener = makeAddr("opener");
    address internal stranger = makeAddr("stranger");

    bytes32 internal marketA;
    bytes32 internal marketB;
    bytes32 internal marketC;
    /// The spot every leg's proof carries unless a test says otherwise.
    uint256 internal spotE8 = BOOK_SPOT_E8;

    function setUp() public virtual override {
        super.setUp();
        marketA = m;
        marketB = list(START, uint40(EXP_B), true);
        marketC = list(START, uint40(EXP_B), true);
        guard = new FairValueGuard(lens, address(this), 120);
        for (uint16 t = 1; t <= 3; ++t) guard.setSpotSource(t, IPrintVerifier(address(rsVerifier)), Policies.TSLA);
        guard.setSigma(lens.marketRef(marketA).seriesId, SIGMA);
        guard.setSigma(lens.marketRef(marketB).seriesId, SIGMA);
        guard.setSigma(lens.marketRef(marketC).seriesId, SIGMA);
        reserve = new ParlayReserve(IERC20(address(usd)), IEventsEngine(address(engine)), lens, guard, defaultParams());

        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
        setBook(marketB, 600_000, 620_000, 580_000, 550_000);
        setBook(marketC, 600_000, 620_000, 580_000, 550_000);
        rest();

        usd.mint(house, 100_000 * ONE);
        usd.mint(opener, 10_000 * ONE);
        vm.prank(house);
        usd.approve(address(reserve), type(uint256).max);
        vm.prank(opener);
        usd.approve(address(reserve), type(uint256).max);
        vm.prank(house);
        reserve.supply(SUPPLY);
    }

    /// Masayume's test params (12 % margin, λ 0.40, 3 legs, 500 cap, 400 per instant, 2 % floor, 20 contracts) plus
    /// the launch D-109 rest and PD-2 slack.
    function defaultParams() internal pure returns (IParlayReserve.Params memory) {
        return IParlayReserve.Params({
            marginBps: 1_200,
            maxExposureBps: 5_000,
            correlationBps: 4_000,
            maxLegs: 3,
            maxPayoutCap: 500 * ONE,
            maxExpiryLocked: 400 * ONE,
            minCombinedProbRaw: 20_000, // 2%
            priceDepthRaw: 20 * ONE,
            minRestSec: uint32(REST),
            fairSlackRaw: 50_000
        });
    }

    /// Lets every order on the book pass the rest filter (D-109).
    function rest() internal {
        vm.warp(vm.getBlockTimestamp() + REST);
    }

    /// Two levels a side, 300 contracts each, from the maker (PostOnly): YES asks rest as BUY_NO, YES bids as BUY_YES.
    /// The new orders must rest `REST` seconds before a leg is priced over them — callers `rest()` after.
    function setBook(bytes32 mk, uint256 ask0, uint256 ask1, uint256 bid0, uint256 bid1) internal {
        clearSeeds(mk);
        _rest(mk, KIND_BUY_NO, ask0, LEVEL);
        _rest(mk, KIND_BUY_NO, ask1, LEVEL);
        _rest(mk, KIND_BUY_YES, bid0, LEVEL);
        _rest(mk, KIND_BUY_YES, bid1, LEVEL);
    }

    function _rest(bytes32 mk, uint8 kind, uint256 priceRaw, uint256 qty) internal {
        (, uint40 lockAt) = _lockOf(mk);
        vm.prank(who(MAKER));
        engine.placeOrder(
            PlaceArgs(mk, kind, ORDER_POST_ONLY, SELF_CANCEL_TAKER, uint16(priceRaw / 1000), uint64(qty / 1000), lockAt, 16, 16, false, false, 0)
        );
    }

    function legs2(bytes32 a, uint8 sideA, bytes32 b, uint8 sideB) internal pure returns (IParlayReserve.LegInput[] memory legs) {
        legs = new IParlayReserve.LegInput[](2);
        legs[0] = IParlayReserve.LegInput(a, sideA);
        legs[1] = IParlayReserve.LegInput(b, sideB);
    }

    function legs3(bytes32 a, bytes32 b, bytes32 c) internal pure returns (IParlayReserve.LegInput[] memory legs) {
        legs = new IParlayReserve.LegInput[](3);
        legs[0] = IParlayReserve.LegInput(a, 0);
        legs[1] = IParlayReserve.LegInput(b, 0);
        legs[2] = IParlayReserve.LegInput(c, 0);
    }

    /// One real RedStone "latest" spot per leg (five test signers, now), all at `spotE8`.
    function spots(uint256 n) internal view returns (bytes[] memory out) {
        out = new bytes[](n);
        for (uint256 i; i < n; ++i) out[i] = PrintSigner.five(Policies.TSLA, spotE8, vm.getBlockTimestamp());
    }

    function openAs(address actor, IParlayReserve.LegInput[] memory legs, uint256 maxPayout) internal returns (uint256 id, uint256 stake) {
        bytes[] memory proofs = spots(legs.length);
        vm.prank(actor);
        (id, stake) = reserve.openParlay(legs, maxPayout, type(uint256).max, proofs);
    }

    /// Settles `mk` for real: a RedStone close above (0 → Up) or below (1 → Down) the open, then `settle`; (2) no close
    /// print and a permissionless `voidExpired` past the admission deadline (the engine pays 0.50 a side).
    function resolve(bytes32 mk, uint8 outcome) internal {
        (, uint40 expiry) = times(mk);
        if (outcome == 2) {
            if (vm.getBlockTimestamp() < uint256(expiry) + 901) vm.warp(uint256(expiry) + 901);
            engine.voidExpired(mk);
        } else {
            if (vm.getBlockTimestamp() < expiry) vm.warp(expiry);
            recordClose(mk, outcome == 0 ? OPEN_E8 + 1e8 : OPEN_E8 - 1e8);
            engine.settle(mk);
        }
    }

    /// `balanceOf(reserve) == liquid + Σ escrow (LIVE, WON) + totalOwedPayouts` — the one accounting identity.
    function assertBooksBalance() internal view {
        uint256 escrow;
        uint256 n = reserve.parlayCount();
        for (uint256 id = 1; id <= n; id++) {
            IParlayReserve.Parlay memory p = reserve.parlayOf(id);
            if (p.status == IParlayReserve.ParlayStatus.LIVE || p.status == IParlayReserve.ParlayStatus.WON) escrow += p.stake + p.houseLocked;
        }
        assertEq(usd.balanceOf(address(reserve)), reserve.liquid() + escrow + reserve.totalOwedPayouts(), "reserve balance == liquid + live escrow + owed");
    }

    /// Nothing the call wrote to the reserve's storage is the engine's or the lens's address (AD-10: market ids only).
    function assertNoVenueAddressInStorage(bytes32[] memory writes) internal view {
        bytes32[2] memory needles = [bytes32(uint256(uint160(address(engine)))), bytes32(uint256(uint160(address(lens))))];
        for (uint256 i = 0; i < writes.length; i++) {
            bytes32 value = vm.load(address(reserve), writes[i]);
            for (uint256 k = 0; k < 2; k++) {
                assertTrue(value != needles[k], "venue address persisted in reserve storage");
            }
        }
    }
}
