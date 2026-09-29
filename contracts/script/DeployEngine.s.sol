// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "./lib/DeploymentWriter.sol";
import {EventsEngine} from "../src/engine/EventsEngine.sol";
import {EngineLens} from "../src/engine/EngineLens.sol";
import {RedStonePrintVerifier} from "../src/engine/verifiers/RedStonePrintVerifier.sol";
import {DataStreamsPrintVerifier} from "../src/engine/verifiers/DataStreamsPrintVerifier.sol";
import {AttestedPrintVerifier} from "../src/engine/verifiers/AttestedPrintVerifier.sol";
import {EngineCheck} from "./lib/EngineCheck.sol";

/// @notice S2.11: deploys the engine venue (engine + its three linked libraries, lens, the three verifiers) and grants
///         the roller, writing `deployments/<chainId>/engine.pending.json` (then `scripts/deploy/finalize.ts`).
/// @dev Ensure-style through `scripts/deploy/engine.sh`: `EnsureEngine` runs first and this script only runs when no
///      engine is recorded. (Forge deploys a script's linked libraries up front, so the deploy path lives in its own
///      script.) Env: `ROLLER` (address), `ATTESTOR` (address, the demo-data attestor), `ENGINE_TREASURY` (optional,
///      defaults to the deployer). Targets Moderato or a Tempo node only (D-059).
contract DeployEngine is DeploymentWriter, EngineCheck {
    function run() external {
        Spec memory s = spec();
        address roller = vm.envAddress("ROLLER");
        address attestor = vm.envAddress("ATTESTOR");
        vm.startBroadcast();
        address deployer = msg.sender;
        address treasury = vm.envOr("ENGINE_TREASURY", deployer);
        EventsEngine engine = new EventsEngine(s.collateral, deployer, treasury);
        EngineLens lens = new EngineLens(address(engine));
        RedStonePrintVerifier rs = new RedStonePrintVerifier(s.redstoneSigners, s.redstoneThreshold);
        DataStreamsPrintVerifier ds = new DataStreamsPrintVerifier(s.dataStreamsProxy);
        address[] memory attestors = new address[](1);
        attestors[0] = attestor;
        AttestedPrintVerifier att = new AttestedPrintVerifier(attestors);
        engine.setRoller(roller, true);
        vm.stopBroadcast();

        checkEngine(engine, lens, rs, ds, att, s, deployer, treasury, roller, attestor);
        recordContract("EventsEngine", address(engine), "EventsEngine.sol:EventsEngine", false);
        recordContract("EngineLens", address(lens), "EngineLens.sol:EngineLens", false);
        recordContract("RedStonePrintVerifier", address(rs), "RedStonePrintVerifier.sol:RedStonePrintVerifier", false);
        recordContract("DataStreamsPrintVerifier", address(ds), "DataStreamsPrintVerifier.sol:DataStreamsPrintVerifier", false);
        recordContract("AttestedPrintVerifier", address(att), "AttestedPrintVerifier.sol:AttestedPrintVerifier", false);
        recordRole("ADMIN", deployer);
        recordRole("ROLLER", roller);
        recordRole("ATTESTOR", attestor);
        recordRole("TREASURY", treasury);
        recordParam("redstoneThreshold", s.redstoneThreshold);
        recordParam("collateral", vm.toString(s.collateral));
        writePending("engine");
    }
}
