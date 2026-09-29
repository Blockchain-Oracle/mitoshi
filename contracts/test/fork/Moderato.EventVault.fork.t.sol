// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/EventVault.fork.t.sol — the Somnia fork becomes a Moderato fork (A.6):
// the vault trades on the deployed engine, not a mock. Same shape: an attended buy, a delegated buy inside caps, a
// settle, an anyone-crank into the owner's balance, and the owner taking everything home.

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StdTokens} from "tempo-std/StdTokens.sol";
import {IEventsEngine} from "../../src/engine/interfaces/IEventsEngine.sol";
import {EngineLens} from "../../src/engine/EngineLens.sol";
import {PositionView} from "../../src/engine/interfaces/IEngineLens.sol";
import {EventVault} from "../../src/products/vault/EventVault.sol";
import {IEventVault} from "../../src/products/vault/IEventVault.sol";
import "../../src/engine/EngineTypes.sol";

/// Replays the S2.12 BTC Window (T 06:10:00Z, real RedStone packages from fixtures/prints) on the deployed venue at the
/// post-deploy block, with a fresh EventVault as the taker. Run: `forge test --match-contract ModeratoEventVaultForkTest`
/// (network; excluded from `contracts:test`).
contract ModeratoEventVaultForkTest is Test {
    uint256 internal constant BLOCK = 37_370_209; // the last ReserveNodes receipt (acceptance/S2.md)
    uint40 internal constant T = 1_790_658_600;
    uint40 internal constant LOCK = T + 300;
    uint256 internal constant ONE = 1e6;
    address internal constant FUNDER = 0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e;

    IEventsEngine internal engine;
    EngineLens internal lens;
    EventVault internal vault;
    bytes32 internal btcSeries;
    address internal roller;
    address internal maker = makeAddr("fork-maker");
    address internal owner = makeAddr("fork-owner");
    address internal actor = makeAddr("fork-session");
    /// Whatever the fork already holds at the vault's address (forge's default CREATE address is funded on
    /// Moderato): a donation the vault's accounting never reads — it must come out untouched.
    uint256 internal donated;

    function setUp() public {
        vm.createSelectFork("https://rpc.moderato.tempo.xyz", BLOCK);
        string memory j = vm.readFile(string.concat(vm.projectRoot(), "/deployments/42431/engine.json"));
        engine = IEventsEngine(vm.parseJsonAddress(j, ".contracts.EventsEngine.address"));
        lens = EngineLens(vm.parseJsonAddress(j, ".contracts.EngineLens.address"));
        btcSeries = vm.parseJsonBytes32(j, ".params['series.BTC-5m']");
        roller = vm.parseJsonAddress(j, ".roles.ROLLER");
        vault = new EventVault(IERC20(address(StdTokens.PATH_USD)), engine, lens);
        donated = StdTokens.PATH_USD.balanceOf(address(vault));
        vm.startPrank(FUNDER);
        StdTokens.PATH_USD.transfer(maker, 20 * ONE);
        StdTokens.PATH_USD.transfer(owner, 20 * ONE);
        vm.stopPrank();
        vm.prank(maker);
        StdTokens.PATH_USD.approve(address(engine), type(uint256).max);
        vm.prank(owner);
        StdTokens.PATH_USD.approve(address(vault), type(uint256).max);
    }

    function _payload(uint40 t) internal view returns (bytes memory) {
        string memory path = string.concat(vm.projectRoot(), "/test/fixtures/prints/redstone-btc-", vm.toString(uint256(t)), ".hex");
        return vm.parseBytes(string.concat("0x", vm.trim(vm.readFile(path))));
    }

    function test_fork_contractOriginatedOrdersFillAndSettle() public {
        vm.warp(T - 60);
        vm.prank(roller);
        bytes32 m = engine.openWindow(OpenWindowArgs(btcSeries, 0, T, LOCK, LOCK, 0, 0));
        vm.startPrank(maker); // the drive's pre-open quotes: YES bid 0.50, YES ask 0.52
        engine.placeOrder(PlaceArgs(m, KIND_BUY_YES, ORDER_POST_ONLY, 0, 500, 2_000, LOCK, 16, 16, false, false, 0));
        engine.placeOrder(PlaceArgs(m, KIND_BUY_NO, ORDER_POST_ONLY, 0, 520, 2_000, LOCK, 16, 16, false, false, 0));
        vm.stopPrank();
        vm.prank(owner);
        vault.deposit(10 * ONE);

        vm.warp(T + 15);
        vm.prank(owner);
        vm.expectRevert(bytes4(keccak256("OpenPrintMissing()"))); // E-19 surfaces through the vault
        vault.place(m, 0, true, 530_000, ONE, uint64(LOCK) * 1e9);
        engine.recordPrint(m, WHICH_OPEN, _payload(T));

        // attended: the owner buys one YES from the Trading Balance (the minimum: minLots 1,000 × lotBase 1,000)
        vm.prank(owner);
        (uint256 spent, uint256 gained) = vault.place(m, 0, true, 530_000, ONE, uint64(LOCK) * 1e9);
        assertEq(gained, ONE);
        assertEq(spent, 520_000, "filled at the maker's 0.52, not the 0.53 limit");

        // delegated: a SESSION key buys one NO inside its caps, from its budget
        vm.prank(owner);
        uint256 id = vault.grant(
            IEventVault.GrantKind.SESSION, actor, IEventVault.Caps(uint128(ONE), uint128(5 * ONE), 2, 0, m), uint64(block.timestamp + 1 hours), 3 * ONE
        );
        vm.prank(actor);
        (uint256 spentNo, uint256 gainedNo) = vault.placeFor(id, m, 1, true, 500_000, ONE, uint64(LOCK) * 1e9);
        assertEq(gainedNo, ONE);
        assertEq(spentNo, 500_000, "NO at 1 - 0.50");
        assertEq(vault.grantOf(id).budget, 3 * ONE - spentNo);
        PositionView memory p = lens.positionOf(m, address(vault));
        assertEq(p.yesFree, 1_000);
        assertEq(p.noFree, 1_000);

        // settlement: the real close print (83,168.48 → 83,220.17: Up), then anyone cranks
        vm.warp(LOCK + 15);
        engine.recordPrint(m, WHICH_CLOSE, _payload(LOCK));
        engine.settle(m);
        uint256 availableBefore = vault.accountOf(owner).available;
        vm.prank(makeAddr("fork-settler"));
        uint256 payout = vault.crankSettle(owner, m);
        assertEq(payout, ONE, "one YES paid one; one NO paid zero");
        assertEq(vault.accountOf(owner).available, availableBefore + payout);
        assertEq(vault.grantOf(id).openPositions, 0);
        p = lens.positionOf(m, address(vault));
        assertEq(p.yesFree + p.noFree, 0);

        // and the owner can take everything home
        vm.prank(owner);
        vault.revoke(id);
        uint256 total = vault.accountOf(owner).available;
        assertEq(total, 10 * ONE - spent - spentNo + payout);
        uint256 walletBefore = StdTokens.PATH_USD.balanceOf(owner);
        vm.prank(owner);
        vault.withdraw(total);
        assertEq(StdTokens.PATH_USD.balanceOf(owner), walletBefore + total);
        assertEq(StdTokens.PATH_USD.balanceOf(address(vault)), donated, "only the donation is left, untouched");
    }
}
