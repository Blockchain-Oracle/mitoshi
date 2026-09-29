// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

/// @notice Records what a deploy script deployed into `deployments/<chainId>/<area>.pending.json`.
/// @dev Tx hashes and blocks aren't visible inside a script, so `scripts/deploy/finalize.ts` merges this file with the
///      forge broadcast receipts into the schema-v1 fragment `deployments/<chainId>/<area>.json` (moving replaced
///      addresses into `history[]`). See `deployments/README.md`.
abstract contract DeploymentWriter is Script {
    string private constant ROOT = "deployments";
    string private _contractsJson;
    string private _paramsJson;
    string private _rolesJson;
    uint256 private _contractCount;

    /// @param name   Contract name as clients see it (e.g. "EventsEngine").
    /// @param addr   Deployed (or proxy) address.
    /// @param artifact Forge artifact id, e.g. "EventsEngine.sol:EventsEngine".
    /// @param proxy  True when `addr` is a proxy; the implementation is recorded under `<name>Implementation`.
    function recordContract(string memory name, address addr, string memory artifact, bool proxy) internal {
        string memory key = string.concat("c.", name);
        vm.serializeAddress(key, "address", addr);
        vm.serializeString(key, "artifact", artifact);
        vm.serializeString(key, "profile", vm.envOr("FOUNDRY_PROFILE", string("default")));
        string memory entry = vm.serializeBool(key, "proxy", proxy);
        _contractsJson = vm.serializeString("contracts", name, entry);
        _contractCount++;
    }

    function recordParam(string memory key, string memory value) internal {
        _paramsJson = vm.serializeString("params", key, value);
    }

    function recordParam(string memory key, uint256 value) internal {
        _paramsJson = vm.serializeUint("params", key, value);
    }

    function recordRole(string memory role, address holder) internal {
        _rolesJson = vm.serializeAddress("roles", role, holder);
    }

    /// @notice Writes the pending file for `area`. Call once at the end of `run()`.
    function writePending(string memory area) internal {
        require(_contractCount > 0, "DeploymentWriter: nothing recorded");
        string memory dir = string.concat(ROOT, "/", vm.toString(block.chainid));
        vm.createDir(dir, true);
        vm.serializeUint("root", "schema", 1);
        vm.serializeUint("root", "chainId", block.chainid);
        vm.serializeString("root", "area", area);
        vm.serializeAddress("root", "deployer", msg.sender);
        vm.serializeString("root", "params", bytes(_paramsJson).length > 0 ? _paramsJson : "{}");
        vm.serializeString("root", "roles", bytes(_rolesJson).length > 0 ? _rolesJson : "{}");
        string memory json = vm.serializeString("root", "contracts", _contractsJson);
        vm.writeJson(json, string.concat(dir, "/", area, ".pending.json"));
    }
}
