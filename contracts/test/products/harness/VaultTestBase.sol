// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/VaultTestBase.sol — the five DreamDEX mocks are retired (A.6, D-018):
// the vault runs against the real engine over a real factory-created TIP-20 (`EngineFixture`), and `BookSeeder`
// rests real maker orders where Masayume's `MockVenue` had fill knobs.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {EventVault} from "../../../src/products/vault/EventVault.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {BookSeeder} from "./BookSeeder.sol";

abstract contract VaultTestBase is BookSeeder {
    uint256 internal constant ONE = 1e6;
    uint256 internal constant DEPOSIT = 1_000 * ONE;
    /// @dev Good till lock: the seam clamps `expireNs / 1e9` to the Window's `lockAt` (D-013, T08).
    uint64 internal constant EXPIRE_NS = type(uint64).max;

    EventVault internal vault;

    address internal owner = makeAddr("owner");
    address internal actor = makeAddr("actor");
    address internal stranger = makeAddr("stranger");
    bytes32 internal market;

    function setUp() public virtual override {
        super.setUp();
        vault = new EventVault(IERC20(address(usd)), IEventsEngine(address(engine)), lens);
        // The vault is an engine holder like any other: the fixture's exact-conservation check covers it.
        actors.push(address(vault));
        market = m;

        usd.mint(owner, 10_000 * ONE);
        vm.prank(owner);
        usd.approve(address(vault), type(uint256).max);
    }

    function caps(uint256 perTrade, uint256 daily, uint32 open, uint64 maxPrice) internal pure returns (IEventVault.Caps memory) {
        return capsIn(perTrade, daily, open, maxPrice, bytes32(0));
    }

    function capsIn(uint256 perTrade, uint256 daily, uint32 open, uint64 maxPrice, bytes32 scope)
        internal
        pure
        returns (IEventVault.Caps memory)
    {
        return IEventVault.Caps({
            maxStakePerTrade: uint128(perTrade), maxDailySpend: uint128(daily), maxOpenPositions: open, maxPriceRaw: maxPrice, market: scope
        });
    }

    function depositAs(address who_, uint256 amount) internal {
        vm.prank(who_);
        vault.deposit(amount);
    }

    function grantStrategy(uint256 budget, IEventVault.Caps memory c) internal returns (uint256 id) {
        vm.prank(owner);
        id = vault.grant(IEventVault.GrantKind.STRATEGY, actor, c, uint64(block.timestamp + 1 days), budget);
    }

    function available(address who_) internal view returns (uint256) {
        return vault.accountOf(who_).available;
    }

    function yesOf(bytes32 mk) internal view returns (uint256) {
        return vault.outcomeId(mk, 0);
    }

    function noOf(bytes32 mk) internal view returns (uint256) {
        return vault.outcomeId(mk, 1);
    }

    /// @dev Masayume's book, on the real engine: rests the side the next order takes, then places it.
    function placeAs(address who_, bytes32 mk, uint8 outcomeIdx, bool isBuy, uint256 priceRaw, uint256 qty)
        internal
        returns (uint256 cashDelta, uint256 tokenDelta)
    {
        book(mk, outcomeIdx, isBuy);
        vm.prank(who_);
        (cashDelta, tokenDelta) = vault.place(mk, outcomeIdx, isBuy, priceRaw, qty, EXPIRE_NS);
        assertConserved();
    }

    function placeForAs(uint256 grantId, bytes32 mk, uint8 outcomeIdx, bool isBuy, uint256 priceRaw, uint256 qty)
        internal
        returns (uint256 cashDelta, uint256 tokenDelta)
    {
        book(mk, outcomeIdx, isBuy);
        vm.prank(vault.grantOf(grantId).actor);
        (cashDelta, tokenDelta) = vault.placeFor(grantId, mk, outcomeIdx, isBuy, priceRaw, qty, EXPIRE_NS);
        assertConserved();
    }

    /// @dev Settles `mk` for real: a RedStone close print above (0 → Up) or below (1 → Down) the open, then
    ///      `settle`; or (2) no close print and a permissionless `voidExpired` after the admission deadline.
    function resolveMarket(bytes32 mk, uint8 outcome) internal {
        (, uint40 expiry) = times(mk);
        if (outcome == 2) {
            vm.warp(uint256(expiry) + 901);
            engine.voidExpired(mk);
        } else {
            vm.warp(expiry);
            recordClose(mk, outcome == 0 ? int256(36_600_000_000) : int256(36_400_000_000));
            engine.settle(mk);
        }
    }

    /// @dev The vault's liabilities (every owner's buckets + every live budget) against its assets (wallet + credit).
    function assertVaultSolvent(address[] memory owners, bytes32[] memory mks) internal view {
        uint256 liabilities;
        for (uint256 i; i < owners.length; ++i) {
            IEventVault.Account memory a = vault.accountOf(owners[i]);
            liabilities += a.available + a.privateAvailable;
        }
        for (uint256 g = 1; g <= vault.grantCount(); ++g) liabilities += vault.grantOf(g).budget;
        uint256 assets = usd.balanceOf(address(vault));
        for (uint256 i; i < mks.length; ++i) assets += lens.creditOf(mks[i], address(vault));
        assertEq(assets, liabilities, "vault wallet + credit == buckets + budgets");
    }
}
