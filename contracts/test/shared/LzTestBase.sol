// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {DoubleEndedQueue} from "@openzeppelin/contracts/utils/structs/DoubleEndedQueue.sol";
import {PacketV1Codec} from "@layerzerolabs/lz-evm-protocol-v2/contracts/messagelib/libs/PacketV1Codec.sol";
import {Origin, ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/// @notice TestHelperOz5 plus a split "verify, then execute" delivery, so tests can prove a failed `lzReceive` leaves
///         the message committed and retryable (the helper's `verifyPackets` does both in one call and reverts both).
abstract contract LzTestBase is TestHelperOz5 {
    using DoubleEndedQueue for DoubleEndedQueue.Bytes32Deque;
    using PacketV1Codec for bytes;

    struct Delivery {
        uint32 dstEid;
        Origin origin;
        address receiver;
        bytes32 guid;
        bytes message;
        uint256 gas;
    }

    function _b32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    /// @notice DVN-verifies and commits the oldest pending packet for `dst`, without executing it.
    function commitNext(uint32 dstEid, address dst) internal returns (Delivery memory d) {
        bytes32 guid = packetsQueue[dstEid][_b32(dst)].popBack();
        bytes memory pkt = packets[guid];
        this.assertGuid(pkt, guid);
        this.validatePacket(pkt, "");
        d = this.decodePacket(pkt);
        (d.gas,) = _parseExecutorLzReceiveOption(optionsLookup[guid]);
    }

    function decodePacket(bytes calldata p) external pure returns (Delivery memory d) {
        d.dstEid = p.dstEid();
        d.origin = Origin(p.srcEid(), p.sender(), p.nonce());
        d.receiver = p.receiverB20();
        d.guid = p.guid();
        d.message = p.message();
    }

    function execute(Delivery memory d, uint256 gas) internal returns (bool ok, bytes memory err) {
        try ILayerZeroEndpointV2(endpoints[d.dstEid]).lzReceive{gas: gas}(d.origin, d.receiver, d.guid, d.message, "") {
            ok = true;
        } catch (bytes memory e) {
            err = e;
        }
    }

    /// @notice Commit + execute with the gas the sender's options asked for; reverts with the receiver's error.
    function deliver(uint32 dstEid, address dst) internal returns (Delivery memory d) {
        d = commitNext(dstEid, dst);
        (bool ok, bytes memory err) = execute(d, d.gas);
        if (!ok) {
            assembly {
                revert(add(err, 32), mload(err))
            }
        }
    }

    /// @notice True while a committed message has not been executed (still retryable at the endpoint).
    function isRetryable(Delivery memory d) internal view returns (bool) {
        return ILayerZeroEndpointV2(endpoints[d.dstEid]).inboundPayloadHash(d.receiver, d.origin.srcEid, d.origin.sender, d.origin.nonce)
            != bytes32(0);
    }
}
