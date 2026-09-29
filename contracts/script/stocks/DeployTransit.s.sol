// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {FragmentReader} from "../lib/FragmentReader.sol";
import {LzNetworks} from "../lib/LzNetworks.sol";
import {TransitOFT} from "../../src/transit/TransitOFT.sol";
import {HopComposer} from "../../src/transit/HopComposer.sol";
import {StockSyncForwarder} from "../../src/transit/StockSyncForwarder.sol";

/// Base Sepolia transit (plan B.1.3, testnet only): per ticker a TransitOFT and its HopComposer; one
/// StockSyncForwarder (`TICKERS=TSLA` deploys a subset; a later full run reuses what exists). Tops up each composer and the forwarder to `FLOAT` wei of ETH (they pay the onward leg).
///   FOUNDRY_PROFILE=evm forge script script/stocks/DeployTransit.s.sol --rpc-url base_sepolia --broadcast
contract DeployTransit is DeploymentWriter, FragmentReader {
    uint256 constant MIN_HOP = 1e12;

    function run() external {
        require(block.chainid == LzNetworks.BASE_SEPOLIA_CHAIN, "testnet script: Base Sepolia only");
        LzNetworks.Net memory net = LzNetworks.byChain(block.chainid);
        string memory existing = fragment(block.chainid, "stocks");
        uint256 float = vm.envOr("FLOAT", uint256(0.01 ether));
        string[] memory t = selectedTickers();

        vm.startBroadcast();
        StockSyncForwarder fwd = StockSyncForwarder(payable(live(existing, "StockSyncForwarder")));
        if (address(fwd) == address(0)) {
            fwd = new StockSyncForwarder(net.endpoint, msg.sender, LzNetworks.RH_TESTNET_EID, LzNetworks.MODERATO_EID);
        }
        _topUp(address(fwd), float);
        for (uint256 i; i < t.length; i++) {
            address transit = live(existing, string.concat("Transit", t[i]));
            if (transit == address(0)) {
                transit = address(new TransitOFT(string.concat("Transit ", t[i]), string.concat("t", t[i]), net.endpoint, msg.sender));
            }
            address composer = live(existing, string.concat("HopComposer", t[i]));
            if (composer == address(0)) {
                composer = address(new HopComposer(
                    net.endpoint, transit, LzNetworks.RH_TESTNET_EID, LzNetworks.MODERATO_EID, MIN_HOP, msg.sender
                ));
            }
            _topUp(composer, float);
            recordContract(string.concat("Transit", t[i]), transit, "TransitOFT.sol:TransitOFT", false);
            recordContract(string.concat("HopComposer", t[i]), composer, "HopComposer.sol:HopComposer", false);
        }
        vm.stopBroadcast();
        recordContract("StockSyncForwarder", address(fwd), "StockSyncForwarder.sol:StockSyncForwarder", false);
        recordParam("floatWei", float);
        writePending("stocks");
    }

    function _topUp(address to, uint256 target) internal {
        if (to.balance < target) payable(to).transfer(target - to.balance);
    }
}
