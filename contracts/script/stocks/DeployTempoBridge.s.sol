// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {DeploymentWriter} from "../lib/DeploymentWriter.sol";
import {FragmentReader} from "../lib/FragmentReader.sol";
import {LzNetworks} from "../lib/LzNetworks.sol";
import {MirrorIssuer} from "./MirrorIssuer.sol";
import {Tickers} from "./Tickers.sol";
import {TIP20MintBurnAdapter} from "../../src/stocks/TIP20MintBurnAdapter.sol";
import {StockSyncReceiver} from "../../src/stocks/StockSyncReceiver.sol";
import {ScaledUIView} from "../../src/stocks/ScaledUIView.sol";

/// Tempo side of the bridge (plan B.1.4, B.2) on Moderato: per ticker the mirror TIP-20, the adapter implementation and
/// its `TransparentUpgradeableProxy(impl, SAFE, initData)` (D-054), the ScaledUIView; one StockSyncReceiver; then the
/// B.2 hand-over (ISSUER → adapter only). Idempotent per contract: a name already in `deployments/<chain>/stocks.json`
/// is reused, so a re-run after a failure continues where it stopped. Peers/options come from `EnsureLzConfig`.
///   forge script script/stocks/DeployTempoBridge.s.sol --rpc-url moderato --broadcast --tempo.fee-token pathUSD
contract DeployTempoBridge is DeploymentWriter, FragmentReader, MirrorIssuer {
    uint256 constant SUPPLY_CAP = 1_000e6; // testnet: 1,000 tokens per ticker (B.2)
    uint128 constant LIMIT = 1_000e6;

    string internal _existing;

    function _prior(string memory name) internal view returns (address) {
        return live(_existing, name);
    }

    function run() external {
        require(block.chainid == LzNetworks.MODERATO_CHAIN, "testnet script: Moderato only");
        LzNetworks.Net memory net = LzNetworks.byChain(block.chainid);
        _existing = fragment(block.chainid, "stocks");
        address safe = vm.envOr("SAFE", msg.sender);
        address guardian = vm.envOr("GUARDIAN", msg.sender);
        string[] memory t = selectedTickers();

        vm.startBroadcast();
        StockSyncReceiver receiver = StockSyncReceiver(_prior("StockSyncReceiver"));
        if (address(receiver) == address(0)) {
            receiver = new StockSyncReceiver(net.endpoint, msg.sender, LzNetworks.RH_TESTNET_CHAIN);
        }
        for (uint256 i; i < t.length; i++) {
            address mirror = issue(t[i], msg.sender);
            address impl = _prior(string.concat("Adapter", t[i], "Implementation"));
            if (impl == address(0)) impl = address(new TIP20MintBurnAdapter(mirror, net.endpoint));
            address adapter = _prior(string.concat("Adapter", t[i]));
            if (adapter == address(0)) {
                adapter = address(new TransparentUpgradeableProxy(
                    impl, safe, abi.encodeCall(TIP20MintBurnAdapter.initialize, (msg.sender, guardian))
                ));
                TIP20MintBurnAdapter(adapter).setInboundLimit(LIMIT, 1 days);
                TIP20MintBurnAdapter(adapter).setOutboundLimit(LzNetworks.BASE_SEPOLIA_EID, LIMIT, 1 days);
            }
            address uiView = _prior(string.concat("ScaledUIView", t[i]));
            if (uiView == address(0)) uiView = address(new ScaledUIView(mirror, address(receiver)));
            if (receiver.mirrorOf(Tickers.rhTestnetStock(t[i])) != mirror) {
                receiver.bindToken(Tickers.rhTestnetStock(t[i]), mirror, ScaledUIView(uiView));
            }
            handOver(mirror, adapter, safe, msg.sender, SUPPLY_CAP);

            recordContract(string.concat("Mirror", t[i]), mirror, "ITIP20.sol:ITIP20", false);
            recordContract(string.concat("Adapter", t[i]), adapter, "TIP20MintBurnAdapter.sol:TIP20MintBurnAdapter", true);
            recordContract(string.concat("Adapter", t[i], "Implementation"), impl, "TIP20MintBurnAdapter.sol:TIP20MintBurnAdapter", false);
            recordContract(string.concat("ScaledUIView", t[i]), uiView, "ScaledUIView.sol:ScaledUIView", false);
        }
        vm.stopBroadcast();
        recordContract("StockSyncReceiver", address(receiver), "StockSyncReceiver.sol:StockSyncReceiver", false);
        recordRole("SAFE", safe);
        recordRole("GUARDIAN", guardian);
        recordParam("supplyCap", SUPPLY_CAP);
        recordParam("srcChainId", LzNetworks.RH_TESTNET_CHAIN);
        writePending("stocks");
    }
}
