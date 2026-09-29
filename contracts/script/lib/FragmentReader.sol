// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

/// @notice Reads committed deployment fragments (`deployments/<chainId>/<area>.json`) so scripts are idempotent and
///         can wire contracts across networks.
abstract contract FragmentReader is Script {
    function fragment(uint256 chainId, string memory area) internal view returns (string memory json) {
        string memory path = string.concat("deployments/", vm.toString(chainId), "/", area, ".json");
        if (vm.exists(path)) json = vm.readFile(path);
    }

    /// @return a The recorded address, or 0 when absent from the fragment.
    function recorded(string memory json, string memory name) internal view returns (address a) {
        if (bytes(json).length == 0) return address(0);
        string memory key = string.concat(".contracts.", name, ".address");
        if (vm.keyExistsJson(json, key)) a = vm.parseJsonAddress(json, key);
    }

    /// @return a The recorded address if code is live there on the current chain, else 0 (deploy again). Names in the
    ///         comma list `REDEPLOY` return 0 too (a changed contract; the old address moves to `history[]`).
    function live(string memory json, string memory name) internal view returns (address a) {
        string[] memory redeploy = vm.envOr("REDEPLOY", ",", new string[](0));
        for (uint256 i; i < redeploy.length; i++) {
            if (keccak256(bytes(redeploy[i])) == keccak256(bytes(name))) return address(0);
        }
        a = recorded(json, name);
        if (a != address(0) && a.code.length == 0) a = address(0);
    }

    function required(string memory json, string memory name) internal view returns (address a) {
        a = recorded(json, name);
        require(a != address(0), string.concat("missing in fragment: ", name));
    }

    /// @notice The five testnet tickers, or the comma list in `TICKERS` (e.g. `TICKERS=TSLA` for a partial mesh).
    function selectedTickers() internal view returns (string[] memory t) {
        string[] memory all = new string[](5);
        (all[0], all[1], all[2], all[3], all[4]) = ("TSLA", "AMZN", "PLTR", "NFLX", "AMD");
        t = vm.envOr("TICKERS", ",", all);
    }
}
