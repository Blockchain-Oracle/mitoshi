// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "./lib/DeploymentWriter.sol";
import {EngineCheck} from "./lib/EngineCheck.sol";

/// @notice S2.11, ensure-style: the node pool has at least the spec's `nodesReserved` nodes (A.1.3), so no user rest
///         ever pays for a node's two slots (≈ 513k gas each, engine-gas.md). Reserves the shortfall in chunks of 16.
contract ReserveNodes is DeploymentWriter, EngineCheck {
    uint32 internal constant CHUNK = 16;

    function run() external {
        Spec memory s = spec();
        Deployed memory d = deployed();
        uint32 have = d.lens.config().highWater;
        if (have < s.nodesReserved) {
            vm.startBroadcast();
            for (uint32 missing = s.nodesReserved - have; missing > 0;) {
                uint32 n = missing < CHUNK ? missing : CHUNK;
                d.engine.reserveNodes(n);
                missing -= n;
            }
            vm.stopBroadcast();
        }
        _drift(d.lens.config().highWater >= s.nodesReserved, "node pool below spec");
        recordParam("nodesReserved", s.nodesReserved);
        recordContract("EventsEngine", address(d.engine), "EventsEngine.sol:EventsEngine", false);
        writePending("engine");
    }
}
