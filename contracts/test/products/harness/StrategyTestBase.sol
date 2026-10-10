// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/test/StrategyRegistry.t.sol (its setUp) — the registry reads EventVaultV2 on
// the real engine (D-218.1) instead of the v1 vault over the mock venue.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../../src/engine/interfaces/IEventsEngine.sol";
import {FairValueGuard} from "../../../src/fair/FairValueGuard.sol";
import {EventVaultV2} from "../../../src/products/vault/EventVaultV2.sol";
import {IEventVault} from "../../../src/products/vault/IEventVault.sol";
import {IAgentIdentity, IEventVaultReads, StrategyRegistry} from "../../../src/products/strategy/StrategyRegistry.sol";
import {IStrategyRegistry} from "../../../src/products/strategy/IStrategyRegistry.sol";
import {VaultTestBase} from "./VaultTestBase.sol";

abstract contract StrategyTestBase is VaultTestBase {
    StrategyRegistry internal registry;
    address internal creator = makeAddr("creator");
    address internal runner = makeAddr("runner");
    uint256 internal strategyId;
    uint128 internal constant FEE = 2 * 1e6;
    bytes internal constant META = '{"name":"Oracle follow"}';

    function setUp() public virtual override {
        super.setUp();
        // The vault users hold today is v2 (v1's funding, grants and trading plus EXIT); the helpers drive it.
        EventVaultV2 v2 = new EventVaultV2(IERC20(address(usd)), IEventsEngine(address(engine)), lens, new FairValueGuard(lens, address(this), 120));
        actors.push(address(v2));
        vault = v2;
        vm.prank(owner);
        usd.approve(address(vault), type(uint256).max);
        registry = new StrategyRegistry(IEventVaultReads(address(vault)), IERC20(address(usd)), IAgentIdentity(address(0)));
        depositAs(owner, DEPOSIT);
        vm.prank(creator);
        strategyId = registry.publish(runner, keccak256("momentum:6:20"), META, caps(50 * ONE, 200 * ONE, 3, 0), FEE, 0);
        vm.prank(owner);
        usd.approve(address(registry), type(uint256).max);
    }

    function grantTo(address actor_, IEventVault.Caps memory c, uint256 budget) internal returns (uint256 id) {
        vm.prank(owner);
        id = vault.grant(IEventVault.GrantKind.STRATEGY, actor_, c, uint64(block.timestamp + 1 days), budget);
    }

    function subscribeAs(address who_, uint256 grantId) internal {
        vm.prank(who_);
        registry.subscribe(strategyId, grantId, IStrategyRegistry.Mode.FOLLOW, FEE);
    }
}
