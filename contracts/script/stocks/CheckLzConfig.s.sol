// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {console} from "forge-std/Script.sol";
import {LzNetworks} from "../lib/LzNetworks.sol";
import {BridgeTopology} from "./BridgeTopology.sol";

/// Read-only: fails (reverts) on any library left at the default, executor/ULN config different from B.1.5, a dead
/// DVN, unsorted DVNs, a wrong peer or missing enforced options. Run once per network; because every end is checked
/// against the same table (send confirmations = source chain's, receive = source chain's), passing on all three
/// networks means both ends of every pathway agree.
///   FOUNDRY_PROFILE=evm forge script script/stocks/CheckLzConfig.s.sol --rpc-url base_sepolia
contract CheckLzConfig is BridgeTopology {
    function run() external view {
        LzNetworks.Net memory local = LzNetworks.byChain(block.chainid);
        (Link[] memory ls, uint256 failures) = links(block.chainid);
        for (uint256 i; i < ls.length; i++) failures += checkLink(local, LzNetworks.byEid(ls[i].remoteEid), ls[i]);
        console.log(string.concat("CheckLzConfig chain ", vm.toString(block.chainid), ": ", vm.toString(ls.length), " links, ", vm.toString(failures), " failures"));
        require(failures == 0, "CheckLzConfig: FAILED");
    }
}
