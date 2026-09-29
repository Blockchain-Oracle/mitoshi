// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {VmRlp} from "tempo-std/StdVm.sol";
import {TxRlp} from "tempo-std/tx/TxRlp.sol";
import {TempoTransaction, TempoTransactionLib} from "tempo-std/tx/TempoTransactionLib.sol";

/// @notice The keychain-signature builder tempo-std lacks (plan B.6: "tempo-std has no keychain-signature builder").
///         A Tempo tx signed by an access key carries a keychain V2 signature: `0x04 ‖ root (20) ‖ inner`, where the
///         access key signs `keccak256(0x04 ‖ txSigningHash ‖ root)` (T1C: only V2 is accepted). Layout and hash from
///         ox `tempo/SignatureEnvelope.ts` (serializedKeychainV2Type) and viem `tempo/Account.ts` (`sign`, v2 branch).
///         `vm.executeTransaction` then runs the tx through Tempo's real handler: expiry, scopes and limits apply.
library KeychainTx {
    using TempoTransactionLib for TempoTransaction;

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @return raw the 0x76 tx signed by the root key itself (primitive secp256k1).
    function signRoot(TempoTransaction memory t, uint256 rootPk) internal pure returns (bytes memory raw) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(rootPk, t.signingHash(VmRlp(address(vm))));
        return t.encodeWithSignature(VmRlp(address(vm)), v, r, s);
    }

    /// @return raw the 0x76 tx signed by `keyPk` on behalf of `root` (keychain V2 envelope).
    function signKey(TempoTransaction memory t, uint256 keyPk, address root) internal pure returns (bytes memory raw) {
        bytes32 inner = keccak256(abi.encodePacked(uint8(0x04), t.signingHash(VmRlp(address(vm))), root));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyPk, inner);
        // encodeWithSignature writes a 65-byte primitive signature as the last list item; swap it for the envelope.
        bytes memory primitive = t.encodeWithSignature(VmRlp(address(vm)), v, r, s);
        bytes memory envelope = abi.encodePacked(uint8(0x04), root, r, s, v);
        return abi.encodePacked(uint8(0x76), TxRlp.prependListPrefix(abi.encodePacked(_body(primitive), TxRlp.encodeString(envelope))));
    }

    /// @notice Runs a signed tx; returns the revert text instead of bubbling (expectRevert can't see into it).
    function tryExecute(bytes memory raw) internal returns (bool ok, string memory reason) {
        try vm.executeTransaction(raw) returns (bytes memory) {
            ok = true;
        } catch (bytes memory r) {
            // The cheatcode reverts with CheatcodeError(string) "vm.executeTransaction: transaction reverted: 0x<data>".
            if (r.length >= 4 && (bytes4(r) == 0xeeaa9e6f || bytes4(r) == 0x08c379a0)) {
                bytes memory payload = new bytes(r.length - 4);
                for (uint256 i; i < payload.length; ++i) payload[i] = r[i + 4];
                reason = abi.decode(payload, (string));
            } else {
                reason = string(r);
            }
        }
    }

    /// @dev The list body of a primitive-signed tx without its trailing `0xb841 ‖ sig65` item.
    function _body(bytes memory raw) private pure returns (bytes memory body) {
        uint8 prefix = uint8(raw[1]);
        require(prefix > 0xf7, "KeychainTx: short list");
        uint256 lenBytes = prefix - 0xf7;
        uint256 start = 2 + lenBytes;
        uint256 end = raw.length - 67;
        require(uint8(raw[end]) == 0xb8 && uint8(raw[end + 1]) == 65, "KeychainTx: unexpected signature item");
        body = new bytes(end - start);
        for (uint256 i; i < body.length; ++i) body[i] = raw[start + i];
    }
}
