// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {MirrorIssuer} from "./MirrorIssuer.sol";

/// Plan B.2 phase 1 on Moderato: the five faucet tickers' mirrors (TSLA, AMZN, PLTR, NFLX, AMD). Roles are handed over
/// by `DeployTempoBridge` once the adapters exist (an adapter needs its mirror's address first); that script also
/// records the mirrors in the `stocks` fragment, so this one only issues and prints.
///   forge script script/stocks/IssueMirrors.s.sol --rpc-url moderato --broadcast --tempo.fee-token pathUSD
contract IssueMirrors is Script, MirrorIssuer {
    function tickers() public pure returns (string[5] memory) {
        return ["TSLA", "AMZN", "PLTR", "NFLX", "AMD"];
    }

    function run() external {
        string[5] memory t = tickers();
        vm.startBroadcast();
        for (uint256 i; i < t.length; i++) {
            console.log(t[i], issue(t[i], msg.sender));
        }
        vm.stopBroadcast();
    }
}
