// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title StockSyncCodec — the StockSync wire format (plan B.1.1, D-020).
/// @notice Every message is a full snapshot:
///   header (23 B):          uint8 version=1 | uint32 srcChainId | uint64 srcTimestamp | uint64 seq | uint16 count
///   0x01 MULTIPLIER (61 B): uint8 type | address rhToken | uint128 current | uint128 pending | uint64 effectiveAt
///   0x02 STATUS     (22 B): uint8 type | address rhToken | uint8 flags
/// Ordering key = (uint128(srcTimestamp) << 64) | seq; a receiver applies a record iff its key is greater than the last
/// applied key for that (mirror, type).
library StockSyncCodec {
    uint8 internal constant VERSION = 1;
    uint8 internal constant T_MULTIPLIER = 0x01;
    uint8 internal constant T_STATUS = 0x02;
    uint256 internal constant HEADER_LEN = 23;
    uint256 internal constant MULTIPLIER_LEN = 61;
    uint256 internal constant STATUS_LEN = 22;

    struct Header {
        uint32 srcChainId;
        uint64 srcTimestamp;
        uint64 seq;
        uint16 count;
    }

    struct Multiplier {
        address rhToken;
        uint128 current;
        uint128 pending;
        uint64 effectiveAt;
    }

    struct Status {
        address rhToken;
        uint8 flags;
    }

    error Truncated(uint256 needed, uint256 have);
    error BadVersion(uint8 version);
    error UnknownRecordType(uint8 recordType, uint256 offset);
    error CountMismatch(uint16 declared, uint256 found);

    // ─── encode ──────────────────────────────────────────────────────────

    function encodeHeader(Header memory h) internal pure returns (bytes memory) {
        return abi.encodePacked(VERSION, h.srcChainId, h.srcTimestamp, h.seq, h.count);
    }

    function encodeMultiplier(Multiplier memory m) internal pure returns (bytes memory) {
        return abi.encodePacked(T_MULTIPLIER, m.rhToken, m.current, m.pending, m.effectiveAt);
    }

    function encodeStatus(Status memory s) internal pure returns (bytes memory) {
        return abi.encodePacked(T_STATUS, s.rhToken, s.flags);
    }

    function orderingKey(uint64 srcTimestamp, uint64 seq) internal pure returns (uint128) {
        return (uint128(srcTimestamp) << 64) | seq;
    }

    // ─── decode ──────────────────────────────────────────────────────────

    function decodeHeader(bytes calldata m) internal pure returns (Header memory h) {
        if (m.length < HEADER_LEN) revert Truncated(HEADER_LEN, m.length);
        uint8 v = uint8(m[0]);
        if (v != VERSION) revert BadVersion(v);
        h.srcChainId = uint32(bytes4(m[1:5]));
        h.srcTimestamp = uint64(bytes8(m[5:13]));
        h.seq = uint64(bytes8(m[13:21]));
        h.count = uint16(bytes2(m[21:23]));
    }

    /// @notice The type byte at `offset` and the offset of the next record; reverts on truncation or unknown type.
    function recordAt(bytes calldata m, uint256 offset) internal pure returns (uint8 recordType, uint256 next) {
        if (offset >= m.length) revert Truncated(offset + 1, m.length);
        recordType = uint8(m[offset]);
        uint256 len;
        if (recordType == T_MULTIPLIER) len = MULTIPLIER_LEN;
        else if (recordType == T_STATUS) len = STATUS_LEN;
        else revert UnknownRecordType(recordType, offset);
        next = offset + len;
        if (next > m.length) revert Truncated(next, m.length);
    }

    function decodeMultiplier(bytes calldata m, uint256 offset) internal pure returns (Multiplier memory r) {
        r.rhToken = address(bytes20(m[offset + 1:offset + 21]));
        r.current = uint128(bytes16(m[offset + 21:offset + 37]));
        r.pending = uint128(bytes16(m[offset + 37:offset + 53]));
        r.effectiveAt = uint64(bytes8(m[offset + 53:offset + 61]));
    }

    function decodeStatus(bytes calldata m, uint256 offset) internal pure returns (Status memory r) {
        r.rhToken = address(bytes20(m[offset + 1:offset + 21]));
        r.flags = uint8(m[offset + 21]);
    }

    /// @notice Full structural check: header, every record known and complete, count matches, no trailing bytes.
    function validate(bytes calldata m) internal pure returns (Header memory h) {
        h = decodeHeader(m);
        uint256 offset = HEADER_LEN;
        uint256 found;
        while (offset < m.length) {
            (, offset) = recordAt(m, offset);
            found++;
        }
        if (found != h.count) revert CountMismatch(h.count, found);
    }
}
