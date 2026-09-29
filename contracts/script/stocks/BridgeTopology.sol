// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {FragmentReader} from "../lib/FragmentReader.sol";
import {LzNetworks} from "../lib/LzNetworks.sol";
import {LzWiring} from "../lib/LzWiring.sol";
import {console} from "forge-std/Script.sol";

/// @title BridgeTopology — the testnet mesh's OApp links per network, read from the three `stocks` fragments.
/// @notice RH testnet 46630: Lockbox<T> ↔ 40245 Transit<T>; StockSyncSender → 40245 StockSyncForwarder.
///         Base Sepolia 84532: Transit<T> ↔ 40451 Lockbox<T> and ↔ 40444 Adapter<T>; Forwarder ← 40451 sender, → 40444
///         receiver. Moderato 42431: Adapter<T> ↔ 40245 Transit<T>; StockSyncReceiver ← 40245 forwarder.
///         Enforced gas (B.1.5 as amended by D-080): into Tempo 1,000,000; into EVM chains 150k; hop legs SEND_AND_CALL
///         150k + lzCompose 400k; sync into the Base forwarder 400k base (it re-sends); forwarder → Tempo receiver 400k base.
///         Tickers default to all five; `TICKERS=TSLA` narrows a run (a partially deployed mesh).
abstract contract BridgeTopology is LzWiring, FragmentReader {
    using OptionsBuilder for bytes;

    uint16 internal constant SEND = 1;
    uint16 internal constant SEND_AND_CALL = 2;
    uint128 internal constant GAS_INTO_TEMPO = 1_000_000;
    uint128 internal constant GAS_INTO_EVM = 150_000;
    uint128 internal constant GAS_COMPOSE = 400_000;
    uint128 internal constant GAS_SYNC_INTO_FORWARDER = 400_000;
    /// @dev Into Tempo the first message on a path also pays the endpoint's first-write (250k, TIP-1000).
    uint128 internal constant GAS_SYNC_INTO_TEMPO = 400_000;

    function _recv(uint128 gas) internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(gas, 0);
    }

    function _hop() internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(GAS_INTO_EVM, 0).addExecutorLzComposeOption(0, GAS_COMPOSE, 0);
    }

    function _opt1(uint32 eid, uint16 t, bytes memory o) internal pure returns (EnforcedOptionParam[] memory a) {
        a = new EnforcedOptionParam[](1);
        a[0] = EnforcedOptionParam(eid, t, o);
    }

    function _opt2(uint32 eid, bytes memory send, bytes memory sendAndCall) internal pure returns (EnforcedOptionParam[] memory a) {
        a = new EnforcedOptionParam[](2);
        a[0] = EnforcedOptionParam(eid, SEND, send);
        a[1] = EnforcedOptionParam(eid, SEND_AND_CALL, sendAndCall);
    }

    /// @dev With `ALLOW_PARTIAL=true` a contract missing from a fragment drops its links (logged) instead of reverting,
    ///      so a mesh can be wired while one network still waits for funds. CheckLzConfig counts drops as failures.
    function _addr(string memory json, string memory name) internal view returns (address a) {
        a = recorded(json, name);
        if (a == address(0) && !vm.envOr("ALLOW_PARTIAL", false)) revert(string.concat("missing in fragment: ", name));
    }

    function _complete(Link[] memory all) internal view returns (Link[] memory out, uint256 dropped) {
        out = new Link[](all.length);
        uint256 n;
        for (uint256 i; i < all.length; i++) {
            if (all[i].oapp == address(0) || all[i].remotePeer == address(0)) {
                console.log(string.concat("SKIP ", all[i].label, " -> ", vm.toString(uint256(all[i].remoteEid)), ": not deployed yet"));
                dropped++;
            } else {
                out[n++] = all[i];
            }
        }
        assembly {
            mstore(out, n)
        }
    }

    function links(uint256 chainId) internal view returns (Link[] memory out, uint256 dropped) {
        (out, dropped) = _complete(_allLinks(chainId));
    }

    function _allLinks(uint256 chainId) internal view returns (Link[] memory out) {
        string[] memory t = selectedTickers();
        string memory rh = fragment(LzNetworks.RH_TESTNET_CHAIN, "stocks");
        string memory base = fragment(LzNetworks.BASE_SEPOLIA_CHAIN, "stocks");
        string memory tempo = fragment(LzNetworks.MODERATO_CHAIN, "stocks");
        uint32 B = LzNetworks.BASE_SEPOLIA_EID;
        out = new Link[](chainId == LzNetworks.BASE_SEPOLIA_CHAIN ? 2 * t.length + 2 : t.length + 1);
        uint256 n;
        for (uint256 i; i < t.length; i++) {
            string memory lb = string.concat("Lockbox", t[i]);
            string memory tr = string.concat("Transit", t[i]);
            string memory ad = string.concat("Adapter", t[i]);
            if (chainId == LzNetworks.RH_TESTNET_CHAIN) {
                out[n++] = Link(lb, _addr(rh, lb), B, _addr(base, tr), true, _opt2(B, _recv(GAS_INTO_EVM), _hop()));
            } else if (chainId == LzNetworks.BASE_SEPOLIA_CHAIN) {
                uint32 R = LzNetworks.RH_TESTNET_EID;
                uint32 M = LzNetworks.MODERATO_EID;
                out[n++] = Link(tr, _addr(base, tr), R, _addr(rh, lb), true, _opt1(R, SEND, _recv(GAS_INTO_EVM)));
                out[n++] = Link(tr, _addr(base, tr), M, _addr(tempo, ad), true, _opt1(M, SEND, _recv(GAS_INTO_TEMPO)));
            } else if (chainId == LzNetworks.MODERATO_CHAIN) {
                out[n++] = Link(ad, _addr(tempo, ad), B, _addr(base, tr), true, _opt2(B, _recv(GAS_INTO_EVM), _hop()));
            } else {
                revert("testnet topology only");
            }
        }
        EnforcedOptionParam[] memory none = new EnforcedOptionParam[](0);
        if (chainId == LzNetworks.RH_TESTNET_CHAIN) {
            out[n++] = Link("StockSyncSender", _addr(rh, "StockSyncSender"), B, _addr(base, "StockSyncForwarder"), true,
                _opt1(B, SEND, _recv(GAS_SYNC_INTO_FORWARDER)));
        } else if (chainId == LzNetworks.BASE_SEPOLIA_CHAIN) {
            address fwd = _addr(base, "StockSyncForwarder");
            out[n++] = Link("StockSyncForwarder", fwd, LzNetworks.RH_TESTNET_EID, _addr(rh, "StockSyncSender"), false, none);
            out[n++] = Link("StockSyncForwarder", fwd, LzNetworks.MODERATO_EID, _addr(tempo, "StockSyncReceiver"), true,
                _opt1(LzNetworks.MODERATO_EID, SEND, _recv(GAS_SYNC_INTO_TEMPO)));
        } else {
            out[n++] = Link("StockSyncReceiver", _addr(tempo, "StockSyncReceiver"), B, _addr(base, "StockSyncForwarder"), false, none);
        }
    }
}
