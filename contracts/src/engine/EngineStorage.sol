// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Config, Series, PolicyVersion, Market, Level, Node, Position} from "./EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/state/*.rs — one ERC-7201
// layout replaces Agari's GlobalConfig, Series, Market, Book and Ledger accounts (A.1.1, A.1.6).

/// @title The engine's one storage layout, read by `EventsEngine`, the delegatecalled libraries and `EngineLens`
///        (which recomputes these slots over `extsload`; `Layout.t.sol` proves the two agree).
library EngineStorage {
    /// @dev `keccak256(abi.encode(uint256(keccak256("tempo.events.engine.v1")) - 1)) & ~bytes32(uint256(0xff))`.
    bytes32 internal constant SLOT = 0xa6a80a4098370da14eba196d5a2b2ba0f19d6808b85f71b2c3b5753304ae1800;

    /// @custom:storage-location erc7201:tempo.events.engine.v1
    struct Layout {
        Config cfg; // +0
        address admin; // +1
        uint32 seriesCount; // +1 (packed with admin)
        address pendingAdmin; // +2
        mapping(address => bool) isRoller; // +3
        mapping(address => bool) crankOptOut; // +4
        mapping(bytes32 => uint32) seriesIdxOf; // +5  seriesId → 1-based index
        mapping(uint32 => bytes32) seriesIdOf; // +6
        mapping(uint32 => Series) series; // +7
        mapping(uint32 => mapping(uint8 => PolicyVersion)) versions; // +8  append-only per series
        mapping(bytes32 => Market) markets; // +9  kept forever
        mapping(uint32 => bytes32) marketIdOf; // +10 mIdx → marketId
        mapping(uint32 => uint256[8]) bits; // +11 [0..3] bid words, [4..7] ask words (1,024 bits per side)
        mapping(uint256 => Level) levels; // +12 key = mIdx << 11 | side << 10 | priceTicks
        mapping(uint32 => Node) nodes; // +13 ONE global recycled pool, 1-based
        mapping(uint32 => mapping(address => Position)) positions; // +14 mIdx → holder → position
    }

    // Slot offsets of the layout's fields (the lens's slot maths).
    uint256 internal constant OFF_CFG = 0;
    uint256 internal constant OFF_ADMIN = 1;
    uint256 internal constant OFF_PENDING_ADMIN = 2;
    uint256 internal constant OFF_IS_ROLLER = 3;
    uint256 internal constant OFF_CRANK_OPT_OUT = 4;
    uint256 internal constant OFF_SERIES_IDX_OF = 5;
    uint256 internal constant OFF_SERIES_ID_OF = 6;
    uint256 internal constant OFF_SERIES = 7;
    uint256 internal constant OFF_VERSIONS = 8;
    uint256 internal constant OFF_MARKETS = 9;
    uint256 internal constant OFF_MARKET_ID_OF = 10;
    uint256 internal constant OFF_BITS = 11;
    uint256 internal constant OFF_LEVELS = 12;
    uint256 internal constant OFF_NODES = 13;
    uint256 internal constant OFF_POSITIONS = 14;

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = SLOT;
        assembly ("memory-safe") {
            l.slot := slot
        }
    }

    /// @notice `seriesId = keccak256(abi.encode(uint16 ticker, uint32 cadenceSec, uint8 basis))` (A.1.1).
    function seriesIdOf(uint16 ticker, uint32 cadenceSec, uint8 basis) internal pure returns (bytes32) {
        return keccak256(abi.encode(ticker, cadenceSec, basis));
    }

    /// @notice `marketId = keccak256(abi.encode(seriesId, uint64 index))` (A.1.1).
    function marketIdOf(bytes32 seriesId, uint64 index) internal pure returns (bytes32) {
        return keccak256(abi.encode(seriesId, index));
    }

    /// @notice Level key `mIdx << 11 | side << 10 | priceTicks` (side 0 = bid, 1 = ask).
    function levelKey(uint32 mIdx, uint256 side, uint16 price) internal pure returns (uint256) {
        return (uint256(mIdx) << 11) | (side << 10) | uint256(price);
    }

    /// @notice `orderId = mIdx << 80 | seq << 32 | nodeIdx` (not stored; live iff the node's seq matches and it is LIVE).
    function orderIdOf(uint32 mIdx, uint48 seq, uint32 idx) internal pure returns (uint128) {
        return (uint128(mIdx) << 80) | (uint128(seq) << 32) | uint128(idx);
    }

    function decodeOrderId(uint128 id) internal pure returns (uint32 mIdx, uint48 seq, uint32 idx) {
        // Truncations are the decoding: mIdx is bits 80..111, seq bits 32..79, idx bits 0..31.
        // forge-lint: disable-next-line(unsafe-typecast)
        mIdx = uint32(id >> 80);
        // forge-lint: disable-next-line(unsafe-typecast)
        seq = uint48(id >> 32);
        // forge-lint: disable-next-line(unsafe-typecast)
        idx = uint32(id);
    }
}
