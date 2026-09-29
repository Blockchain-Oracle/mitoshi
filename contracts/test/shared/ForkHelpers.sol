// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

/// Shared bits for the 14c.12 fork tests (read-only against live networks; nothing is broadcast).
abstract contract ForkHelpers is Test {
    bytes32 internal constant PACKET_SENT = keccak256("PacketSent(bytes,bytes,address)");
    bytes32 internal constant COMPOSE_SENT = keccak256("ComposeSent(address,address,bytes32,uint16,bytes)");

    function _b32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }

    /// @return n How many PacketSent events `endpoint` emitted in the recorded logs.
    function _packetsSent(Vm.Log[] memory logs, address endpoint) internal pure returns (uint256 n) {
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == endpoint && logs[i].topics[0] == PACKET_SENT) n++;
        }
    }

    function _composeMsg(Vm.Log[] memory logs) internal pure returns (bytes32 guid, bytes memory message) {
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == COMPOSE_SENT) {
                (,, guid,, message) = abi.decode(logs[i].data, (address, address, bytes32, uint16, bytes));
                return (guid, message);
            }
        }
        revert("no ComposeSent");
    }
}
