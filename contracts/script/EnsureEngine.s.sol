// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineCheck} from "./lib/EngineCheck.sol";

/// @notice S2.11: checks the recorded engine venue against the spec and the roles; never writes. Fails on drift.
///         Env: `ROLLER`, `ATTESTOR`, `ENGINE_TREASURY` (optional), `ENGINE_ADMIN` (optional; defaults to the fragment's).
contract EnsureEngine is EngineCheck {
    function run() external view {
        Spec memory s = spec();
        Deployed memory d = deployed();
        string memory j = vm.readFile(fragmentPath());
        address admin = vm.envOr("ENGINE_ADMIN", vm.parseJsonAddress(j, ".roles.ADMIN"));
        address treasury = vm.envOr("ENGINE_TREASURY", vm.parseJsonAddress(j, ".roles.TREASURY"));
        checkEngine(d.engine, d.lens, d.rs, d.ds, d.att, s, admin, treasury, vm.envAddress("ROLLER"), vm.envAddress("ATTESTOR"));
    }
}
