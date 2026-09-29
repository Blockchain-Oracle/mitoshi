// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {ThemeRegistry} from "../../src/themes/ThemeRegistry.sol";
import {ThemeRouter} from "../../src/themes/ThemeRouter.sol";
import {IThemeOracle} from "../../src/themes/interfaces/IThemeOracle.sol";

/// @notice Deploys the theme contracts (plan S16c.4, B.4) and records the `themes` deployment fragment.
///   forge script script/themes/DeployThemes.s.sol --rpc-url moderato --broadcast \
///     --private-key <deployer-themes> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 themes DeployThemes.s.sol && pnpm codegen
/// The PoolManager is the replayed v4 (D-021, `deployments/42431/v4.json`). What depends on S15b–c is configured
/// later by the owner (D-101/D-102): `registry.setGuard(StockGuardHook)`, `registry.setTokenPool(mirror, key)` per
/// mirror, `router.setOracle(StockReference view)`, `router.setProofTarget` + `setProofSelector`.
/// Owner: `THEMES_OWNER` or the broadcaster (testnet: the lane key, handed to the Safe with S19, Q-016).
contract DeployThemes is DeploymentWriter {
    address internal constant POOL_MANAGER = 0x33620f62C5b9B2086dD6b62F4A297A9f30347029;

    function run() external {
        address owner = vm.envOr("THEMES_OWNER", msg.sender);
        address oracle = vm.envOr("THEME_ORACLE", address(0));
        require(POOL_MANAGER.code.length > 0, "PoolManager not on this chain");
        vm.startBroadcast();
        ThemeRegistry registry = new ThemeRegistry(owner);
        ThemeRouter router = new ThemeRouter(IPoolManager(POOL_MANAGER), registry, IThemeOracle(oracle), owner);
        vm.stopBroadcast();

        recordContract("ThemeRegistry", address(registry), "ThemeRegistry.sol:ThemeRegistry", false);
        recordContract("ThemeRouter", address(router), "ThemeRouter.sol:ThemeRouter", false);
        recordRole("owner", owner);
        recordParam("poolManager", vm.toString(POOL_MANAGER));
        recordParam("oracle", vm.toString(oracle));
        recordParam("guard", "unset until S15b registers the StockGuardHook pools (D-101)");
        recordParam("maxCreatorFeeBps", 50);
        writePending("themes");
    }
}
