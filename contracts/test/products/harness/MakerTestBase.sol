// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/MakerTestBase.sol — `MockMakerVenue`/`MockMakerPool` are retired (A.6,
// D-018): the vault quotes on the real engine over a real factory-created TIP-20 (`EngineFixture`), and a real taker
// crosses its quotes where the mock had a `fill(orderId, qty)` knob. Same constants: 1,000 supplied, a 300 s Window,
// 20 contracts a side at YES 0.48 / 0.52.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {OrderView} from "../../../src/engine/interfaces/IEngineLens.sol";
import {IMarketMakerVault} from "../../../src/products/maker/IMarketMakerVault.sol";
import {MarketMakerVault} from "../../../src/products/maker/MarketMakerVault.sol";
import {Policies} from "../../engine/harness/Policies.sol";
import {BookSeeder} from "./BookSeeder.sol";
import "../../../src/engine/EngineTypes.sol";

abstract contract MakerTestBase is BookSeeder {
    uint256 internal constant ONE = 1e6;
    uint256 internal constant SUPPLY = 1_000 * ONE;
    uint64 internal constant NOW = START;
    uint64 internal constant EXPIRY = LOCK;
    uint256 internal constant QTY = 20 * ONE;
    /// @dev A YES bid at 0.48 and a YES ask at 0.52: a NO buy at 0.48 in the engine's terms, 0.04 of a set uncovered.
    uint256 internal constant BID_YES = 480_000;
    uint256 internal constant ASK_YES = 520_000;
    uint256 internal constant TAKER = 70;

    MarketMakerVault internal vault;

    address internal house = makeAddr("house");
    address internal maker = makeAddr("maker");
    address internal stranger = makeAddr("stranger");

    bytes32 internal marketA;
    /// @dev Collateral sent to the vault outside `supply` — never part of its value (A.4.2: no inflation guard needed).
    uint256 internal donated;

    function setUp() public virtual override {
        super.setUp();
        vault = new MarketMakerVault(IERC20(address(usd)), IEventsEngine(address(engine)), lens, defaultParams());
        vault.setMaker(maker);
        // The vault is an engine holder like any other: the fixture's exact-conservation check covers it.
        actors.push(address(vault));
        marketA = m;

        usd.mint(house, 100_000 * ONE);
        vm.prank(house);
        usd.approve(address(vault), type(uint256).max);
        vm.prank(house);
        vault.supply(SUPPLY);
    }

    function defaultParams() internal pure returns (IMarketMakerVault.Params memory) {
        return IMarketMakerVault.Params({
            maxExposureBps: 5_000,
            minSpreadRaw: 20_000,
            minPriceRaw: 50_000,
            maxPriceRaw: 950_000,
            maxQuantityRaw: 50 * ONE,
            maxWindowDeployed: 200 * ONE,
            maxOpenWindows: 4,
            minTimeLeftSec: 30
        });
    }

    function expireNs() internal pure returns (uint64) {
        return uint64(EXPIRY) * 1e9;
    }

    function quoteA() internal returns (uint256 escrow) {
        vm.prank(maker);
        escrow = vault.quote(marketA, BID_YES, ASK_YES, QTY, expireNs());
        assertConserved();
    }

    function quoteOn(bytes32 mk, uint256 qty) internal returns (uint256 escrow) {
        vm.prank(maker);
        escrow = vault.quote(mk, BID_YES, ASK_YES, qty, expireNs());
    }

    /// @dev The vault's live orders on a Window, newest first — what the engine's per-holder list holds.
    function ordersOn(bytes32 mk) internal view returns (OrderView[] memory) {
        return lens.openOrdersOf(mk, address(vault));
    }

    /// @dev A real taker sells YES into the vault's best bid: a NO buy (IOC) at the bid's YES price, filling `qty` of
    ///      it through the MintPair path — the vault is handed YES (Masayume: `pool.fill(bidId, qty)`).
    function hitBid(bytes32 mk, uint256 priceRaw, uint256 qty) internal {
        _take(mk, KIND_BUY_NO, priceRaw, qty);
    }

    /// @dev A real taker buys YES at the vault's ask (its NO bid): the vault is handed NO.
    function hitAsk(bytes32 mk, uint256 priceRaw, uint256 qty) internal {
        _take(mk, KIND_BUY_YES, priceRaw, qty);
    }

    function fillBoth(bytes32 mk, uint256 qty) internal {
        hitBid(mk, BID_YES, qty);
        hitAsk(mk, ASK_YES, qty);
    }

    function _take(bytes32 mk, uint8 kind, uint256 priceRaw, uint256 qty) internal {
        address t = who(TAKER);
        (, uint40 lockAt) = _lockOf(mk);
        vm.prank(t);
        PlaceResult memory r = engine.placeOrder(
            PlaceArgs(mk, kind, ORDER_IOC, SELF_CANCEL_TAKER, uint16(priceRaw / 1000), uint64(qty / 1000), lockAt, 16, 16, false, true, 0)
        );
        assertEq(uint256(r.filledLots) * 1000, qty, "the taker filled against the vault");
        assertConserved();
    }

    /// @dev Settles `mk` for real: a RedStone close print above (0 → Up/YES) or below (1 → Down/NO) the open, then
    ///      `settle`; or (2) no close print and a permissionless `voidExpired` after the admission deadline.
    function resolve(bytes32 mk, uint8 outcome) internal {
        (, uint40 expiry) = times(mk);
        if (outcome == 2) {
            if (block.timestamp < uint256(expiry) + 901) vm.warp(uint256(expiry) + 901);
            engine.voidExpired(mk);
        } else {
            if (block.timestamp < expiry) vm.warp(expiry);
            recordClose(mk, outcome == 0 ? int256(36_600_000_000) : int256(36_400_000_000));
            engine.settle(mk);
        }
    }

    /// @dev A Gap-basis Window (stock sessions): trading locks at `lockAt`, settlement is at the later `expiry` (T08).
    function listGap(uint40 tradingStart, uint40 lockAt, uint40 expiry) internal returns (bytes32 id) {
        vm.startPrank(admin);
        bytes32 sid = engine.registerSeries(
            RegisterSeriesArgs(++nextTicker, BASIS_GAP, GAP_CADENCE_SEC, 1000, 1000, 1, 20, 400_000, 32, 16)
        );
        PolicyVersion memory v = Policies.launch(address(rsVerifier), 0, OPEN_ENDED);
        v.primary.openAdmissionSec = ADMIT_UNTIL_LOCK;
        engine.addPolicyVersion(sid, 0, v);
        vm.stopPrank();
        vm.prank(roller);
        id = engine.openWindow(OpenWindowArgs(sid, 0, tradingStart, lockAt, expiry, 0, 2));
        markets.push(id);
        recordOpen(id, 36_500_000_000);
    }

    /// @dev `balanceOf(vault) == liquid` — every engine return is collected into the wallet in the same call; only a
    ///      donation (never booked) sits beside it.
    function assertBooksBalance() internal view {
        assertEq(usd.balanceOf(address(vault)), vault.liquid() + donated, "vault wallet == liquid (+ donations)");
    }
}
