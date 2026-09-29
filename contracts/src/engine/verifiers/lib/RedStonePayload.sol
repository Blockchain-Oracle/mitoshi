// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEngineErrors as E} from "../../EngineErrors.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/crates/agari-common/src/print/redstone.rs
// (`preparse` and the package layout).

/// @title The RedStone wire payload, read in place from calldata (A.5.1): `N × package ‖ N[2] ‖ metaSize[3] = 0 ‖
///        marker[9]`, each package `feedId[32] ‖ value[32] ‖ ts_ms[6] ‖ valueSize[4] = 32 ‖ pointCount[3] = 1 ‖
///        r[32] ‖ s[32] ‖ v[1]` (142 B, single feed, 32-byte value).
library RedStonePayload {
    uint256 internal constant PACKAGE_LEN = 142;
    uint256 internal constant TRAILER_LEN = 14;
    /// The signed part of a package: everything before the signature.
    uint256 internal constant SIGNED_LEN = 77;
    bytes9 internal constant MARKER = 0x000002ed57011e0000;

    /// @notice Step 1, no crypto: marker, empty unsigned metadata, `1 ≤ N ≤ maxN`, exact length, every package single
    ///         feed with a 32-byte value. Returns N. Bounds all later work (`BadRedStonePackage`).
    function preparse(bytes calldata p, uint256 maxN) internal pure returns (uint256 n) {
        uint256 len = p.length;
        if (len < TRAILER_LEN || bytes9(p[len - 9:len]) != MARKER || _be(p[len - 12:len - 9]) != 0) {
            revert E.BadRedStonePackage();
        }
        n = _be(p[len - 14:len - 12]);
        if (n == 0 || n > maxN || len != PACKAGE_LEN * n + TRAILER_LEN) revert E.BadRedStonePackage();
        for (uint256 i; i < n; ++i) {
            uint256 at = i * PACKAGE_LEN;
            if (_be(p[at + 74:at + 77]) != 1 || _be(p[at + 70:at + 74]) != 32) revert E.BadRedStonePackage();
        }
    }

    function feedId(bytes calldata p, uint256 i) internal pure returns (bytes32) {
        return bytes32(p[i * PACKAGE_LEN:i * PACKAGE_LEN + 32]);
    }

    function value(bytes calldata p, uint256 i) internal pure returns (uint256) {
        return uint256(bytes32(p[i * PACKAGE_LEN + 32:i * PACKAGE_LEN + 64]));
    }

    function timestampMs(bytes calldata p, uint256 i) internal pure returns (uint256) {
        return _be(p[i * PACKAGE_LEN + 64:i * PACKAGE_LEN + 70]);
    }

    /// @notice `keccak256` of the signed 77 bytes, and the `(v, r, s)` that sign it (`v` 0/1 is read as 27/28).
    function signature(bytes calldata p, uint256 i) internal pure returns (bytes32 digest, uint8 v, bytes32 r, bytes32 s) {
        uint256 at = i * PACKAGE_LEN;
        digest = keccak256(p[at:at + SIGNED_LEN]);
        r = bytes32(p[at + 77:at + 109]);
        s = bytes32(p[at + 109:at + 141]);
        v = uint8(p[at + 141]);
        if (v < 27) v += 27;
    }

    function _be(bytes calldata b) private pure returns (uint256 x) {
        for (uint256 i; i < b.length; ++i) x = (x << 8) | uint8(b[i]);
    }
}
