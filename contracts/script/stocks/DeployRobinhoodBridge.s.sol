// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {FragmentReader} from "../lib/FragmentReader.sol";
import {LzNetworks} from "../lib/LzNetworks.sol";
import {Tickers} from "./Tickers.sol";
import {StockLockbox} from "../../src/robinhood/StockLockbox.sol";
import {StockSyncSender} from "../../src/robinhood/StockSyncSender.sol";

/// Robinhood Chain testnet side (plan B.1.2): one immutable StockLockbox per faucet ticker + one StockSyncSender.
/// Idempotent per contract via the `stocks` fragment. Peers/options come from `EnsureLzConfig`.
///   FOUNDRY_PROFILE=evm forge script script/stocks/DeployRobinhoodBridge.s.sol --rpc-url robinhood_testnet --broadcast
contract DeployRobinhoodBridge is DeploymentWriter, FragmentReader {
    uint256 constant MIN_LOCK = 1e12; // one shared-decimal unit (1e-6 share)
    uint128 constant LIMIT = 1_000e18;

    function run() external {
        require(block.chainid == LzNetworks.RH_TESTNET_CHAIN, "testnet script: RH testnet only");
        LzNetworks.Net memory net = LzNetworks.byChain(block.chainid);
        string memory existing = fragment(block.chainid, "stocks");
        address guardian = vm.envOr("GUARDIAN", msg.sender);
        string[] memory t = selectedTickers();

        vm.startBroadcast();
        StockSyncSender sender = StockSyncSender(live(existing, "StockSyncSender"));
        if (address(sender) == address(0)) sender = new StockSyncSender(net.endpoint, msg.sender);
        for (uint256 i; i < t.length; i++) {
            address stock = Tickers.rhTestnetStock(t[i]);
            address box = live(existing, string.concat("Lockbox", t[i]));
            if (box == address(0)) {
                box = address(new StockLockbox(stock, net.endpoint, msg.sender, guardian, MIN_LOCK));
                StockLockbox(box).setRateLimits(LzNetworks.BASE_SEPOLIA_EID, LIMIT, 1 days);
            }
            if (sender.lockboxOf(stock) != box) sender.registerToken(stock, box);
            recordContract(string.concat("Lockbox", t[i]), box, "StockLockbox.sol:StockLockbox", false);
        }
        vm.stopBroadcast();
        recordContract("StockSyncSender", address(sender), "StockSyncSender.sol:StockSyncSender", false);
        recordRole("GUARDIAN", guardian);
        recordParam("minLockLD", MIN_LOCK);
        writePending("stocks");
    }
}
