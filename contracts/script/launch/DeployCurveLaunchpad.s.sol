// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {LaunchRegistry} from "../../src/launch/LaunchRegistry.sol";
import {ReservedCodes} from "../../src/launch/ReservedCodes.sol";
import {LiquidityLocker} from "../../src/launch/LiquidityLocker.sol";
import {CurveLaunchpad} from "../../src/launch/CurveLaunchpad.sol";

/// @notice Deploys the memecoin launchpad (plan S17b, B.5.2): LiquidityLocker, CurveLaunchpad (+ its linked
///         CurveConfigLib / CurveGraduationLib, which forge deploys through the deterministic deployer) and binds them
///         to a LaunchRegistry. `LAUNCH_REGISTRY` reuses an existing registry (its owner must then call
///         `setCurveLaunchpad` itself); otherwise a registry owned by the broadcaster is deployed and bound here
///         (D-096). Root key only (CREATE).
///   forge script script/launch/DeployCurveLaunchpad.s.sol --rpc-url moderato --broadcast \
///     --private-key <deployer-launch> --tempo.fee-token 0x20C0000000000000000000000000000000000000
///   tsx scripts/deploy/finalize.ts 42431 launch DeployCurveLaunchpad.s.sol && pnpm codegen
contract DeployCurveLaunchpad is DeploymentWriter {
    function run() external {
        address owner = vm.envOr("LAUNCH_OWNER", msg.sender);
        address treasury = vm.envOr("LAUNCH_TREASURY", owner);
        address existing = vm.envOr("LAUNCH_REGISTRY", address(0));

        vm.startBroadcast();
        LaunchRegistry registry = existing == address(0) ? new LaunchRegistry(owner) : LaunchRegistry(existing);
        LiquidityLocker locker = new LiquidityLocker(owner);
        CurveLaunchpad pad = new CurveLaunchpad(owner, address(registry), address(locker), treasury);
        if (existing == address(0)) registry.setCurveLaunchpad(address(pad));
        locker.setLaunchpad(address(pad));
        vm.stopBroadcast();

        recordContract("LaunchRegistry", address(registry), "LaunchRegistry.sol:LaunchRegistry", false);
        recordContract("LiquidityLocker", address(locker), "LiquidityLocker.sol:LiquidityLocker", false);
        recordContract("CurveLaunchpad", address(pad), "CurveLaunchpad.sol:CurveLaunchpad", false);
        recordRole("owner", owner);
        recordRole("protocolTreasury", treasury);
        recordParam("reservedCodes", ReservedCodes.COUNT);
        recordParam("curvePolicyId", uint256(pad.curvePolicyId()));
        recordParam("poolManagerBlacklistId", uint256(pad.poolManagerBlacklistId()));
        writePending("launch");
    }
}
