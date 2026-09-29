// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {LzNetworks} from "../lib/LzNetworks.sol";
import {LzPing} from "../../src/lz/LzPing.sol";
import {LzPingTempo} from "../../src/lz/LzPingTempo.sol";

/// Spike X1 (plan B.1.6): deploys the ping OApp on the current network (LzPingTempo on Tempo/Moderato).
///   forge script script/lz/DeployLzPing.s.sol --rpc-url <net> --broadcast   (+ Tempo: --tempo.fee-token pathUSD)
contract DeployLzPing is DeploymentWriter {
    function run() external {
        LzNetworks.Net memory net = LzNetworks.byChain(block.chainid);
        bool tempo = block.chainid == LzNetworks.MODERATO_CHAIN || block.chainid == LzNetworks.TEMPO_CHAIN;
        vm.startBroadcast();
        address ping = tempo
            ? address(new LzPingTempo(net.endpoint, msg.sender))
            : address(new LzPing(net.endpoint, msg.sender));
        vm.stopBroadcast();
        recordContract("LzPing", ping, tempo ? "LzPingTempo.sol:LzPingTempo" : "LzPing.sol:LzPing", false);
        recordParam("eid", uint256(net.eid));
        writePending("lz");
    }
}

/// Peers the ping OApp on this network with the ones on `REMOTE_EIDS` (comma list) at `REMOTE_PINGS` (same order).
contract WireLzPing is DeploymentWriter {
    function run() external {
        LzPing ping = LzPing(vm.envAddress("LZ_PING"));
        uint256[] memory eids = vm.envUint("REMOTE_EIDS", ",");
        address[] memory remotes = vm.envAddress("REMOTE_PINGS", ",");
        vm.startBroadcast();
        for (uint256 i; i < eids.length; i++) {
            ping.setPeer(uint32(eids[i]), bytes32(uint256(uint160(remotes[i]))));
        }
        vm.stopBroadcast();
    }
}
