// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {OApp, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {OAppOptionsType3} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LzPing — spike X1 (plan B.1.6): one tiny OApp per network to measure a LayerZero leg end to end.
/// @notice `ping` sends `(pingId, sentAt, srcChainId)`; the receiving side records when it landed and the gas left, so a
///         leg's latency is `receivedAt - sentAt` read from chain state (not from an indexer).
contract LzPing is OApp, OAppOptionsType3 {
    struct Landing {
        uint64 pingId;
        uint64 sentAt;
        uint64 receivedAt;
        uint32 srcChainId;
        uint32 srcEid;
    }

    uint16 public constant MSG_PING = 1;

    uint64 public nextPingId = 1;
    /// @notice The last ping that landed per source eid.
    mapping(uint32 srcEid => Landing) public lastLanding;
    uint256 public landedCount;

    event PingSent(bytes32 indexed guid, uint32 indexed dstEid, uint64 pingId, uint64 sentAt, uint256 nativeFee);
    event PingLanded(bytes32 indexed guid, uint32 indexed srcEid, uint64 pingId, uint64 sentAt, uint64 receivedAt);

    constructor(address endpoint_, address owner_) OApp(endpoint_, owner_) Ownable(owner_) {}

    function quotePing(uint32 dstEid, bytes calldata extraOptions) external view returns (MessagingFee memory) {
        return _quote(dstEid, _payload(nextPingId), this.combineOptions(dstEid, MSG_PING, extraOptions), false);
    }

    function ping(uint32 dstEid, bytes calldata extraOptions) external payable returns (MessagingReceipt memory r) {
        uint64 id = nextPingId++;
        bytes memory options = this.combineOptions(dstEid, MSG_PING, extraOptions);
        bytes memory payload = _payload(id);
        MessagingFee memory fee = _quote(dstEid, payload, options, false);
        r = _lzSend(dstEid, payload, options, fee, msg.sender);
        emit PingSent(r.guid, dstEid, id, uint64(block.timestamp), fee.nativeFee);
    }

    function _payload(uint64 id) internal view returns (bytes memory) {
        return abi.encode(id, uint64(block.timestamp), uint32(block.chainid));
    }

    function _lzReceive(Origin calldata origin, bytes32 guid, bytes calldata message, address, bytes calldata)
        internal
        override
    {
        (uint64 id, uint64 sentAt, uint32 srcChainId) = abi.decode(message, (uint64, uint64, uint32));
        lastLanding[origin.srcEid] = Landing(id, sentAt, uint64(block.timestamp), srcChainId, origin.srcEid);
        landedCount++;
        emit PingLanded(guid, origin.srcEid, id, sentAt, uint64(block.timestamp));
    }

    /// @dev EVM chains pay `msg.value`; excess is refunded by the endpoint to `msg.sender`.
    function _payNative(uint256 nativeFee) internal virtual override returns (uint256) {
        if (msg.value < nativeFee) revert NotEnoughNative(msg.value);
        return msg.value;
    }
}
