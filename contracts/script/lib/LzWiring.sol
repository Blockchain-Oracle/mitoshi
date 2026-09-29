// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";
import {UlnConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/UlnBase.sol";
import {ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/SendLibBase.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {LzNetworks} from "./LzNetworks.sol";

interface IWiredOApp {
    function peers(uint32 eid) external view returns (bytes32);
    function setPeer(uint32 eid, bytes32 peer) external;
    function enforcedOptions(uint32 eid, uint16 msgType) external view returns (bytes memory);
    function setEnforcedOptions(EnforcedOptionParam[] calldata params) external;
}

interface IUlnView {
    function getAppUlnConfig(address oapp, uint32 remoteEid) external view returns (UlnConfig memory);
    function executorConfigs(address oapp, uint32 eid) external view returns (uint32 maxMessageSize, address executor);
}

/// @title LzWiring — ensure-style LayerZero configuration for one OApp × remote eid (plan B.1.5; chain-libs §5).
/// @notice Order: pin send/receive libraries → executor (type 1) and ULN (type 2) on the send library, ULN on the
///         receive library → peer → enforced options. Every step reads first and writes only a difference, so a re-run
///         is a no-op. Config is pinned explicitly (never left to defaults: mainnet defaults are the dead DVN).
///         Send ULN confirmations are the local chain's; receive ULN confirmations are the remote (source) chain's;
///         DVN addresses are always the local chain's instances, sorted ascending.
abstract contract LzWiring is Script {
    uint32 internal constant CONFIG_EXECUTOR = 1;
    uint32 internal constant CONFIG_ULN = 2;
    uint32 internal constant MAX_MESSAGE_SIZE = 10_000;

    struct Link {
        string label;
        address oapp;
        uint32 remoteEid;
        address remotePeer;
        bool sends; // false: receive-only (send-side config and options are skipped)
        EnforcedOptionParam[] options;
    }

    function _uln(address[] memory dvns, uint64 confirmations) internal pure returns (UlnConfig memory u) {
        u = UlnConfig(confirmations, uint8(dvns.length), 0, 0, dvns, new address[](0));
    }

    function _sameUln(UlnConfig memory a, UlnConfig memory b) internal pure returns (bool) {
        return keccak256(abi.encode(a)) == keccak256(abi.encode(b));
    }

    function _peer(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    /// @notice Writes whatever differs. Must run inside a broadcast by the OApp's owner and endpoint delegate.
    function ensureLink(LzNetworks.Net memory local, LzNetworks.Net memory remote, Link memory l) internal {
        ILayerZeroEndpointV2 ep = ILayerZeroEndpointV2(local.endpoint);
        if (l.sends && (ep.isDefaultSendLibrary(l.oapp, l.remoteEid) || ep.getSendLibrary(l.oapp, l.remoteEid) != local.sendLib)) {
            ep.setSendLibrary(l.oapp, l.remoteEid, local.sendLib);
        }
        (address rlib, bool isDefault) = ep.getReceiveLibrary(l.oapp, l.remoteEid);
        if (isDefault || rlib != local.receiveLib) ep.setReceiveLibrary(l.oapp, l.remoteEid, local.receiveLib, 0);

        if (l.sends) {
            SetConfigParam[] memory send = new SetConfigParam[](2);
            uint256 n;
            (uint32 size, address exec) = IUlnView(local.sendLib).executorConfigs(l.oapp, l.remoteEid);
            if (size != MAX_MESSAGE_SIZE || exec != local.executor) {
                send[n++] = SetConfigParam(l.remoteEid, CONFIG_EXECUTOR, abi.encode(ExecutorConfig(MAX_MESSAGE_SIZE, local.executor)));
            }
            UlnConfig memory want = _uln(local.dvns, local.confirmations);
            if (!_sameUln(IUlnView(local.sendLib).getAppUlnConfig(l.oapp, l.remoteEid), want)) {
                send[n++] = SetConfigParam(l.remoteEid, CONFIG_ULN, abi.encode(want));
            }
            if (n > 0) {
                assembly {
                    mstore(send, n)
                }
                ep.setConfig(l.oapp, local.sendLib, send);
            }
        }
        UlnConfig memory wantRecv = _uln(local.dvns, remote.confirmations);
        if (!_sameUln(IUlnView(local.receiveLib).getAppUlnConfig(l.oapp, l.remoteEid), wantRecv)) {
            SetConfigParam[] memory recv = new SetConfigParam[](1);
            recv[0] = SetConfigParam(l.remoteEid, CONFIG_ULN, abi.encode(wantRecv));
            ep.setConfig(l.oapp, local.receiveLib, recv);
        }

        if (IWiredOApp(l.oapp).peers(l.remoteEid) != _peer(l.remotePeer)) {
            IWiredOApp(l.oapp).setPeer(l.remoteEid, _peer(l.remotePeer));
        }
        EnforcedOptionParam[] memory todo = new EnforcedOptionParam[](l.options.length);
        uint256 m;
        for (uint256 i; i < l.options.length; i++) {
            EnforcedOptionParam memory o = l.options[i];
            if (keccak256(IWiredOApp(l.oapp).enforcedOptions(o.eid, o.msgType)) != keccak256(o.options)) todo[m++] = o;
        }
        if (m > 0) {
            assembly {
                mstore(todo, m)
            }
            IWiredOApp(l.oapp).setEnforcedOptions(todo);
        }
    }

    /// @notice Read-only verification; logs each failure and returns how many there were.
    function checkLink(LzNetworks.Net memory local, LzNetworks.Net memory remote, Link memory l)
        internal
        view
        returns (uint256 f)
    {
        ILayerZeroEndpointV2 ep = ILayerZeroEndpointV2(local.endpoint);
        if (l.oapp.code.length == 0) return _fail(l, "no code at OApp");
        if (l.sends) {
            if (ep.isDefaultSendLibrary(l.oapp, l.remoteEid)) f += _fail(l, "send library not pinned");
            if (ep.getSendLibrary(l.oapp, l.remoteEid) != local.sendLib) f += _fail(l, "send library differs");
            (uint32 size, address exec) = IUlnView(local.sendLib).executorConfigs(l.oapp, l.remoteEid);
            if (size != MAX_MESSAGE_SIZE || exec != local.executor) f += _fail(l, "executor config differs");
            f += _checkUln(l, IUlnView(local.sendLib).getAppUlnConfig(l.oapp, l.remoteEid), _uln(local.dvns, local.confirmations), "send");
            for (uint256 i; i < l.options.length; i++) {
                EnforcedOptionParam memory o = l.options[i];
                if (keccak256(IWiredOApp(l.oapp).enforcedOptions(o.eid, o.msgType)) != keccak256(o.options)) {
                    f += _fail(l, "enforced options differ");
                }
            }
        }
        (address rlib, bool isDefault) = ep.getReceiveLibrary(l.oapp, l.remoteEid);
        if (isDefault) f += _fail(l, "receive library not pinned");
        if (rlib != local.receiveLib) f += _fail(l, "receive library differs");
        f += _checkUln(l, IUlnView(local.receiveLib).getAppUlnConfig(l.oapp, l.remoteEid), _uln(local.dvns, remote.confirmations), "receive");
        if (IWiredOApp(l.oapp).peers(l.remoteEid) != _peer(l.remotePeer)) f += _fail(l, "peer differs");
    }

    function _checkUln(Link memory l, UlnConfig memory got, UlnConfig memory want, string memory side)
        internal
        pure
        returns (uint256 f)
    {
        address[5] memory dead = LzNetworks.deadDvns();
        for (uint256 i; i < got.requiredDVNs.length; i++) {
            for (uint256 j; j < 5; j++) if (got.requiredDVNs[i] == dead[j]) f += _fail(l, string.concat(side, ": dead DVN"));
            if (i > 0 && got.requiredDVNs[i] <= got.requiredDVNs[i - 1]) f += _fail(l, string.concat(side, ": DVNs unsorted"));
        }
        if (!_sameUln(got, want)) f += _fail(l, string.concat(side, ": ULN config differs from B.1.5"));
    }

    function _fail(Link memory l, string memory why) internal pure returns (uint256) {
        console.log(string.concat("FAIL ", l.label, " -> ", vm.toString(uint256(l.remoteEid)), ": ", why));
        return 1;
    }
}
