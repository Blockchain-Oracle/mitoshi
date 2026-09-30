// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/LeverageTestBase.sol — `MockLeverageVenue`/`MockLeveragePool` are retired
// (A.6, D-018): the reserve takes a real maker's PostOnly levels on the real engine over a real TIP-20 (`BookSeeder`),
// holds its contracts in its own engine position, and settles on a real RedStone close or a missed close. Same
// constants: 1,000 supplied, a 5-minute Window, YES asks 0.60 then 0.62 and bids 0.58 then 0.55 (300 contracts a
// level), 3× / 8 % / 120 % / 50 %. New: the FairValueGuard and one signed spot per open or knock-out (PD-2), orders
// resting `REST` seconds before the knock-out and at-birth walks count them (PD-2a), and the engine's 0.001 lot.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {IPrintVerifier} from "../../../src/engine/interfaces/IPrintVerifier.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {ILeverageReserve} from "../../../src/products/leverage/ILeverageReserve.sol";
import {LeverageReserve} from "../../../src/products/leverage/LeverageReserve.sol";
import {PrintSigner} from "../../engine/harness/PrintSigner.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {BookSeeder} from "./BookSeeder.sol";
import "../../../src/engine/EngineTypes.sol";

abstract contract LeverageTestBase is BookSeeder {
    uint256 internal constant ONE = 1e6;
    uint256 internal constant SUPPLY = 1_000 * ONE;
    uint256 internal constant STAKE = 10 * ONE;
    uint32 internal constant TWO_X = 20_000;
    uint32 internal constant THREE_X = 30_000;
    uint40 internal constant REST = 20;
    uint64 internal constant EXPIRY = LOCK;
    uint64 internal constant SIGMA = 18_531;
    uint256 internal constant LEVEL = 300 * ONE;
    /// A spot the book agrees with (fair P(Up) ≈ 0.59 at the suites' clocks), and one that has crashed (≈ 0.03).
    uint256 internal constant BOOK_SPOT_E8 = 36_525_000_000;
    uint256 internal constant CRASH_SPOT_E8 = 36_300_000_000;

    LeverageReserve internal reserve;
    FairValueGuard internal guard;

    address internal house = makeAddr("house");
    address internal opener = makeAddr("opener");
    address internal stranger = makeAddr("stranger");

    bytes32 internal marketA;
    uint256 internal spotE8 = BOOK_SPOT_E8;

    function setUp() public virtual override {
        super.setUp();
        marketA = m;
        guard = new FairValueGuard(lens, address(this), 120);
        guard.setSpotSource(lens.marketRef(marketA).ticker, IPrintVerifier(address(rsVerifier)), Policies.TSLA);
        guard.setSigma(lens.marketRef(marketA).seriesId, SIGMA);
        reserve = new LeverageReserve(IERC20(address(usd)), IEventsEngine(address(engine)), lens, guard, defaultParams());
        // The reserve is an engine holder like any other: the fixture's exact-conservation check covers it.
        actors.push(address(reserve));
        setBook(marketA, 600_000, 620_000, 580_000, 550_000);
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

    function defaultParams() internal pure returns (ILeverageReserve.Params memory) {
        return ILeverageReserve.Params({
            maxLeverageBps: THREE_X,
            premiumBps: 800,
            maintenanceBps: 12_000,
            maxExposureBps: 5_000,
            minEntryPriceRaw: 20_000,
            maxEntryPriceRaw: 950_000,
            maxFrontedPerPosition: 200 * ONE,
            maxWindowFronted: 400 * ONE,
            maxOpenPositions: 8,
            minTimeLeftSec: 30,
            minRestSec: uint32(REST),
            fairSlackRaw: 50_000
        });
    }

    function rest() internal {
        vm.warp(vm.getBlockTimestamp() + REST);
    }

    /// Two levels a side, 300 contracts each, from the maker (PostOnly): YES asks rest as BUY_NO, YES bids as BUY_YES.
    function setBook(bytes32 mk, uint256 ask0, uint256 ask1, uint256 bid0, uint256 bid1) internal {
        clearSeeds(mk);
        restOrder(mk, KIND_BUY_NO, ask0, LEVEL);
        restOrder(mk, KIND_BUY_NO, ask1, LEVEL);
        restOrder(mk, KIND_BUY_YES, bid0, LEVEL);
        restOrder(mk, KIND_BUY_YES, bid1, LEVEL);
    }

    /// One level of YES bids only, `qty` contracts at `price` — the exit side a knock-out meets.
    function setBids(bytes32 mk, uint256 price, uint256 qty) internal {
        clearSeeds(mk);
        restOrder(mk, KIND_BUY_YES, price, qty);
    }

    function restOrder(bytes32 mk, uint8 kind, uint256 priceRaw, uint256 qty) internal {
        (, uint40 lockAt) = _lockOf(mk);
        vm.prank(who(MAKER));
        engine.placeOrder(
            PlaceArgs(mk, kind, ORDER_POST_ONLY, SELF_CANCEL_TAKER, uint16(priceRaw / 1000), uint64(qty / 1000), lockAt, 16, 16, false, false, 0)
        );
    }

    function spot() internal view returns (bytes memory) {
        return PrintSigner.five(Policies.TSLA, spotE8, vm.getBlockTimestamp());
    }

    function crashSpot() internal view returns (bytes memory) {
        return PrintSigner.five(Policies.TSLA, CRASH_SPOT_E8, vm.getBlockTimestamp());
    }

    /// The stake-first open, guarded at the size the quote saw.
    function openFor(address actor, bytes32 marketId, uint8 outcomeIdx, uint256 stake, uint32 leverageBps) internal returns (uint256 id, uint256 charged) {
        ILeverageReserve.Preview memory q = reserve.sizeForStake(marketId, outcomeIdx, stake, leverageBps);
        bytes memory proof = spot();
        vm.prank(actor);
        (id, charged) = reserve.open(marketId, outcomeIdx, stake, leverageBps, q.quantityRaw, proof);
    }

    function openRaw(address actor, bytes32 marketId, uint8 outcomeIdx, uint256 stake, uint32 leverageBps, uint256 minQuantity)
        internal
        returns (uint256 id, uint256 charged)
    {
        bytes memory proof = spot();
        vm.prank(actor);
        (id, charged) = reserve.open(marketId, outcomeIdx, stake, leverageBps, minQuantity, proof);
    }

    /// Settles `mk` for real: a RedStone close above (0 → Up) or below (1 → Down) the open, or (2) a void.
    function resolve(bytes32 mk, uint8 outcome) internal {
        (, uint40 expiry) = times(mk);
        if (outcome == 2) {
            if (vm.getBlockTimestamp() < uint256(expiry) + 901) vm.warp(uint256(expiry) + 901);
            engine.voidExpired(mk);
        } else {
            if (vm.getBlockTimestamp() < expiry) vm.warp(expiry);
            recordClose(mk, outcome == 0 ? int256(36_600_000_000) : int256(36_400_000_000));
            engine.settle(mk);
        }
    }

    /// The reserve's contracts held for it in the engine, raw (`yesFree` / `noFree` × lotBase).
    function heldRaw(bytes32 mk, uint8 outcomeIdx) internal view returns (uint256) {
        return uint256(outcomeIdx == 0 ? lens.positionOf(mk, address(reserve)).yesFree : lens.positionOf(mk, address(reserve)).noFree) * 1000;
    }

    /// `balanceOf(reserve) == liquid + totalOwedPayouts` and `outstanding == Σ fronted` over LIVE positions.
    function assertBooksBalance() internal view {
        assertEq(usd.balanceOf(address(reserve)), reserve.liquid() + reserve.totalOwedPayouts(), "reserve wallet == liquid + owed");
        uint256 fronted;
        uint256 n = reserve.positionCount();
        for (uint256 id = 1; id <= n; id++) {
            ILeverageReserve.Position memory p = reserve.positionOf(id);
            if (p.status == ILeverageReserve.PositionStatus.LIVE) fronted += p.fronted;
        }
        assertEq(reserve.outstanding(), fronted, "outstanding == sum of live fronts");
    }
}
