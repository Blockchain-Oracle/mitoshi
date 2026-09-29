// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Print, SOURCE_NONE} from "../EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/state/market.rs (`Print`).

/// @title A `Print` packed into 128 bits so a `Market` holds two per slot (F-S2-07):
///        bits 0..63 priceE8 (two's complement) · 64..103 sourceTs · 104..111 source · 112..119 signers · 120..127 flags.
library PrintLib {
    function pack(Print memory p) internal pure returns (uint128) {
        return uint128(uint64(p.priceE8)) | (uint128(p.sourceTs) << 64) | (uint128(p.source) << 104)
            | (uint128(p.signers) << 112) | (uint128(p.flags) << 120);
    }

    function unpack(uint128 v) internal pure returns (Print memory p) {
        // Truncations are the decoding of the fixed bit layout above.
        // forge-lint: disable-next-line(unsafe-typecast)
        p.priceE8 = int64(uint64(v));
        // forge-lint: disable-next-line(unsafe-typecast)
        p.sourceTs = uint40(v >> 64);
        // forge-lint: disable-next-line(unsafe-typecast)
        p.source = uint8(v >> 104);
        // forge-lint: disable-next-line(unsafe-typecast)
        p.signers = uint8(v >> 112);
        // forge-lint: disable-next-line(unsafe-typecast)
        p.flags = uint8(v >> 120);
    }

    /// @notice `source == SOURCE_NONE` means the slot is empty.
    function isEmpty(uint128 v) internal pure returns (bool) {
        return uint8(v >> 104) == SOURCE_NONE;
    }

    // forge-lint: disable-next-line(unsafe-typecast)
    function priceE8(uint128 v) internal pure returns (int64) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return int64(uint64(v));
    }
}
