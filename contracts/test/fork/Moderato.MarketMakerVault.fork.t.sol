// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/MarketMakerVault.fork.t.sol — the Shannon fork becomes a Moderato fork
// (A.6): the vault quotes on the deployed engine with the launch params. Same shape: a post-only pair rests inside the
// Window's book, two takers hit both sides, the pair merges back for one, a second quote is pulled to the cent — plus
// a third quote filled on one side and settled on the Window's real RedStone close print.

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {OrderView, LevelRaw} from "../../src/engine/interfaces/IEngineLens.sol";
import {IMarketMakerVault} from "../../src/products/maker/IMarketMakerVault.sol";
import {MarketMakerVault} from "../../src/products/maker/MarketMakerVault.sol";
import {DeployMarketMakerVault} from "../../script/DeployMarketMakerVault.s.sol";
import "../../src/engine/EngineTypes.sol";

/// Replays the S2.12 BTC Window (T 06:10:00Z, real RedStone packages from fixtures/prints) on the deployed venue at the
/// post-deploy block, with a fresh MarketMakerVault as the maker. Run:
/// `forge test --match-contract ModeratoMarketMakerVaultForkTest` (network; excluded from `contracts:test`).
contract ModeratoMarketMakerVaultForkTest is Test {
    uint256 internal constant BLOCK = 37_370_209; // the last ReserveNodes receipt (acceptance/S2.md)
    uint40 internal constant T = 1_790_658_600;
    uint40 internal constant LOCK = T + 300;
    uint256 internal constant ONE = 1e6;
    uint256 internal constant QTY = 2 * ONE;
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    IEventsEngine internal engine;
    EngineLens internal lens;
    MarketMakerVault internal vault;
    IERC20 internal usd = IERC20(address(StdTokens.PATH_USD));
    bytes32 internal btcSeries;
    address internal roller;
    address internal house = makeAddr("fork-house");
    address internal maker = makeAddr("fork-maker");
    address internal taker = makeAddr("fork-taker");
    /// Whatever the fork already holds at the vault's address (forge's default CREATE address is funded on Moderato,
    /// F-S7-05): a donation the vault's accounting never reads.
    uint256 internal donated;

    function setUp() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz", BLOCK);
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/engine.json"));
        engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        lens = EngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        btcSeries = vm.parseJsonBytes32(j, ".params['series.BTC-5m']");
        roller = vm.parseJsonAddress(j, ".roles.ROLLER");
        vault = new MarketMakerVault(usd, engine, lens, new DeployMarketMakerVault().launchParams());
        vault.setMaker(maker);
        donated = usd.balanceOf(address(vault));
        vm.startPrank(FUNDER);
        usd.transfer(house, 20 * ONE);
        usd.transfer(taker, 20 * ONE);
        vm.stopPrank();
        vm.startPrank(house);
        usd.approve(address(vault), type(uint256).max);
        vault.supply(20 * ONE);
        vm.stopPrank();
        vm.prank(taker);
        usd.approve(address(engine), type(uint256).max);
    }

    function _payload(uint40 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-btc-", vm.toString(uint256(t)), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function _take(bytes32 m, uint8 kind, uint256 priceRaw) internal {
        vm.prank(taker);
        engine.placeOrder(PlaceArgs(m, kind, ORDER_IOC, SELF_CANCEL_TAKER, uint16(priceRaw / 1000), uint64(QTY / 1000), LOCK, 16, 16, false, true, 0));
    }

    function test_fork_aPairRestsFillsMergesPullsAndSettles() public {
        vm.warp(T - 60);
        vm.prank(roller);
        bytes32 id = engine.openWindow(OpenWindowArgs(btcSeries, 0, T, LOCK, LOCK, 0, 0));
        vm.warp(T + 15);
        engine.recordPrint(id, WHICH_OPEN, _payload(T));

        // Masayume priced one tick inside the live top of book; this fresh Window's book is empty, so the pair sits
        // around even odds (Masayume's fallback), two minimum spreads apart.
        (uint256 bidYes, uint256 askYes) = (480_000, 520_000);
        uint64 expireNs = uint64(LOCK) * 1e9;
        vm.prank(maker);
        uint256 escrow = vault.quote(id, bidYes, askYes, QTY, expireNs);
        console2.log("escrow for 2 a side", escrow);
        assertEq(escrow, (bidYes + ONE - askYes) * QTY / ONE);
        assertEq(vault.deployedOf(id), escrow);
        OrderView[] memory os = lens.openOrdersOf(id, address(vault));
        assertEq(os.length, 2, "both bids rest on the real book");
        LevelRaw[] memory bids = lens.levelsRaw(id, true, 1, 0, 64);
        LevelRaw[] memory asks = lens.levelsRaw(id, false, 1, 0, 64);
        assertEq(bids[0].price, bidYes, "depth visible via the lens: the vault's bid is the top");
        assertEq(asks[0].price, askYes, "and its ask");
        assertEq(bids[0].quantity, QTY);

        // A taker buys NO at the vault's YES bid (the vault is handed YES), then YES at its ask (handed NO).
        _take(id, KIND_BUY_NO, bidYes);
        _take(id, KIND_BUY_YES, askYes);
        (uint256 yes, uint256 no) = vault.inventoryOf(id);
        assertEq(yes, QTY);
        assertEq(no, QTY);

        (uint256 pairs, uint256 back) = vault.merge(id);
        assertEq(pairs, QTY);
        assertEq(back, QTY, "a complete set is worth one on the real engine");
        assertEq(usd.balanceOf(address(vault)), vault.liquid() + donated, "credit collected");
        assertGt(vault.totalValue(), 20 * ONE, "the spread is realized");
        console2.log("share price x1e6", vault.sharePriceRaw());

        vm.prank(maker);
        uint256 escrow2 = vault.quote(id, bidYes, askYes, QTY, expireNs);
        vm.prank(maker);
        (uint256 orders, uint256 returned) = vault.pull(id);
        assertEq(orders, 2);
        assertEq(returned, escrow2, "an unfilled pair comes back to the cent");
        assertEq(vault.deployedOf(id), 0, "everything the venue held came back or was merged");

        // A third pair, one side filled, settled on the Window's real close print (83,168.48 → 83,220.17: Up).
        vm.prank(maker);
        vault.quote(id, bidYes, askYes, QTY, expireNs);
        _take(id, KIND_BUY_NO, bidYes);
        vm.warp(LOCK + 15);
        engine.recordPrint(id, WHICH_CLOSE, _payload(LOCK));
        engine.settle(id);
        vm.prank(makeAddr("fork-settler"));
        uint256 payout = vault.settle(id);
        assertEq(payout, QTY, "2 YES paid 2");
        IMarketMakerVault.WindowBook memory b = vault.bookOf(id);
        console2.log("realized (x1e6)", uint256(int256(b.realized)));
        assertEq(int256(b.realized), int256(QTY - escrow) + int256(QTY) - int256(bidYes * QTY / ONE));
        assertEq(usd.balanceOf(address(vault)), vault.liquid() + donated);

        uint256 shares = vault.sharesOf(house);
        uint256 walletBefore = usd.balanceOf(house);
        vm.prank(house);
        uint256 got = vault.withdraw(shares);
        assertEq(usd.balanceOf(house), walletBefore + got);
        assertEq(usd.balanceOf(address(vault)), donated, "only the donation is left, untouched");
    }
}
