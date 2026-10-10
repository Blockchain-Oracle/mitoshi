// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/script/Deploy.s.sol (its StrategyRegistry step) — the registry binds to the
// Trading Balance v2 from `deployments/<chainId>/vault2.json` (D-218.1) and to the chain's ERC-8004 IdentityRegistry
// (packages/clients/src/pinned.ts), and its address goes into the `strategies` fragment.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAgentIdentity, IEventVaultReads, StrategyRegistry} from "../../src/products/strategy/StrategyRegistry.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";

interface IVaultPins {
    function collateral() external view returns (IERC20);
}

/// @notice Deploys the StrategyRegistry (S9.1, A.4.8) over the live EventVaultV2 and records the `strategies` fragment.
///   forge script script/products/DeployStrategyRegistry.s.sol --rpc-url moderato --broadcast --slow \
///     --private-key <deployer-products> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 strategies DeployStrategyRegistry.s.sol && pnpm codegen
/// @dev No admin and no parameters: the registry is immutable, its vault, collateral, lens and identity fixed at birth.
contract DeployStrategyRegistry is DeploymentWriter {
    /// ERC-8004 IdentityRegistry per chain — different vanity sets per network (00-network-facts, pinned.ts).
    function identityOf(uint256 chainId) public pure returns (address) {
        if (chainId == 42431) return 0x8004A818BFB912233c491871b3d84c89A494BD9e;
        if (chainId == 4217) return 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
        return address(0);
    }

    function run() external returns (StrategyRegistry registry) {
        string memory root = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid));
        address vault = vm.parseJsonAddress(vm.readFile(string.concat(root, "/vault2.json")), ".contracts.EventVaultV2.address");
        address identity = identityOf(block.chainid);
        require(vault.code.length > 0, "vault2 not on this chain");
        require(identity.code.length > 0, "no ERC-8004 IdentityRegistry on this chain");
        IERC20 collateral = IVaultPins(vault).collateral();

        vm.startBroadcast();
        registry = new StrategyRegistry(IEventVaultReads(vault), collateral, IAgentIdentity(identity));
        vm.stopBroadcast();

        require(address(registry.vault()) == vault && registry.collateral() == collateral, "vault not wired");
        require(address(registry.lens()) == address(IEventVaultReads(vault).lens()), "lens not the vault's");
        require(address(registry.identity()) == identity, "identity not wired");

        recordContract("StrategyRegistry", address(registry), "StrategyRegistry.sol:StrategyRegistry", false);
        recordParam("vault", vm.toString(vault));
        recordParam("collateral", vm.toString(address(collateral)));
        recordParam("lens", vm.toString(address(registry.lens())));
        recordParam("identity", vm.toString(identity));
        recordParam("maxMetadataBytes", registry.MAX_METADATA_BYTES());
        writePending("strategies");
    }
}
