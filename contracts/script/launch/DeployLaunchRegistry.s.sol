// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {LaunchRegistry} from "../../src/launch/LaunchRegistry.sol";
import {ReservedCodes} from "../../src/launch/ReservedCodes.sol";

/// @notice Deploys the LaunchRegistry (plan S17a, B.5.1) and records the `launch` deployment fragment.
///   forge script script/launch/DeployLaunchRegistry.s.sol --rpc-url moderato --broadcast \
///     --private-key <deployer> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 launch DeployLaunchRegistry.s.sol && pnpm codegen
/// Owner: `LAUNCH_OWNER` or the broadcaster (testnet: the single owner key, Q-016).
contract DeployLaunchRegistry is DeploymentWriter {
    function run() external {
        address owner = vm.envOr("LAUNCH_OWNER", msg.sender);
        vm.startBroadcast();
        LaunchRegistry registry = new LaunchRegistry(owner);
        vm.stopBroadcast();

        recordContract("LaunchRegistry", address(registry), "LaunchRegistry.sol:LaunchRegistry", false);
        recordRole("owner", owner);
        recordParam("reservedCodes", ReservedCodes.COUNT);
        writePending("launch");
    }
}
