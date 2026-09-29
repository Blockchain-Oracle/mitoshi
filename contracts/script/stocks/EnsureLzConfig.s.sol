// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LzNetworks} from "../lib/LzNetworks.sol";
import {BridgeTopology} from "./BridgeTopology.sol";

/// Applies the B.1.5 LayerZero configuration to every bridge OApp on the current network (writes only differences).
///   FOUNDRY_PROFILE=evm forge script script/stocks/EnsureLzConfig.s.sol --rpc-url robinhood_testnet --broadcast
///   forge script script/stocks/EnsureLzConfig.s.sol --rpc-url moderato --broadcast --tempo.fee-token pathUSD
contract EnsureLzConfig is BridgeTopology {
    function run() external {
        LzNetworks.Net memory local = LzNetworks.byChain(block.chainid);
        (Link[] memory ls,) = links(block.chainid);
        vm.startBroadcast();
        for (uint256 i; i < ls.length; i++) ensureLink(local, LzNetworks.byEid(ls[i].remoteEid), ls[i]);
        vm.stopBroadcast();
    }
}
