// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage as ES} from "../EngineStorage.sol";
import {Config, Series, PrintPolicy, PolicyVersion, Market, Level, Node, Position} from "../EngineTypes.sol";

/// @title The lens's slot maths and decoders over `EngineStorage.Layout` (Solidity's documented storage layout:
///        `keccak256(h(key) . p)` for mapping values, packed value types low-order first, every struct starting a slot).
/// @dev `Layout.t.sol` writes through the engine and reads back through these, field by field.
library LensSlots {
    uint256 private constant BASE = uint256(ES.SLOT);

    function cfgSlot() internal pure returns (bytes32) {
        return bytes32(BASE + ES.OFF_CFG);
    }

    function adminSlot() internal pure returns (bytes32) {
        return bytes32(BASE + ES.OFF_ADMIN);
    }

    function pendingAdminSlot() internal pure returns (bytes32) {
        return bytes32(BASE + ES.OFF_PENDING_ADMIN);
    }

    function isRollerSlot(address who) internal pure returns (bytes32) {
        return keccak256(abi.encode(who, BASE + ES.OFF_IS_ROLLER));
    }

    function crankOptOutSlot(address who) internal pure returns (bytes32) {
        return keccak256(abi.encode(who, BASE + ES.OFF_CRANK_OPT_OUT));
    }

    function seriesIdxOfSlot(bytes32 seriesId) internal pure returns (bytes32) {
        return keccak256(abi.encode(seriesId, BASE + ES.OFF_SERIES_IDX_OF));
    }

    function seriesIdOfSlot(uint32 idx) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(idx), BASE + ES.OFF_SERIES_ID_OF));
    }

    function seriesSlot(uint32 idx) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(idx), BASE + ES.OFF_SERIES));
    }

    function versionSlot(uint32 seriesIdx, uint8 index) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(index), keccak256(abi.encode(uint256(seriesIdx), BASE + ES.OFF_VERSIONS))));
    }

    function marketSlot(bytes32 m) internal pure returns (bytes32) {
        return keccak256(abi.encode(m, BASE + ES.OFF_MARKETS));
    }

    function marketIdOfSlot(uint32 mIdx) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(mIdx), BASE + ES.OFF_MARKET_ID_OF));
    }

    /// The first of a side's four bitmap words (`uint256[8]` inline in the mapping value: bids 0..3, asks 4..7).
    function bitsSlot(uint32 mIdx, uint256 side) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encode(uint256(mIdx), BASE + ES.OFF_BITS))) + side * 4);
    }

    function levelSlot(uint32 mIdx, uint256 side, uint16 price) internal pure returns (bytes32) {
        return keccak256(abi.encode(ES.levelKey(mIdx, side, price), BASE + ES.OFF_LEVELS));
    }

    function nodeSlot(uint32 idx) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint256(idx), BASE + ES.OFF_NODES));
    }

    function positionSlot(uint32 mIdx, address holder) internal pure returns (bytes32) {
        return keccak256(abi.encode(holder, keccak256(abi.encode(uint256(mIdx), BASE + ES.OFF_POSITIONS))));
    }

    // ------------------------------------------------------------------------------------------------ decoders
    // forge-lint: disable-start(unsafe-typecast)

    function config(uint256 w) internal pure returns (Config memory c) {
        c = Config(uint8(w), uint32(w >> 8), uint32(w >> 40), uint32(w >> 72), uint48(w >> 104), uint96(w >> 152));
    }

    function series(uint256[] memory w) internal pure returns (Series memory s) {
        (s.ticker, s.basis, s.cadenceSec) = (uint16(w[0]), uint8(w[0] >> 16), uint32(w[0] >> 24));
        (s.lotBase, s.tickBase, s.cashUnit) = (uint64(w[0] >> 56), uint64(w[0] >> 120), uint64(w[0] >> 184));
        (s.minLots, s.nextIndex, s.lastExpiry) = (uint64(w[1]), uint64(w[1] >> 64), uint40(w[1] >> 128));
        (s.minRestSec, s.maxLeadSec) = (uint32(w[1] >> 168), uint32(w[1] >> 200));
        (s.fillsCap, s.evictionsCap, s.versionCount) = (uint8(w[1] >> 232), uint8(w[1] >> 240), uint8(w[1] >> 248));
    }

    function printPolicy(uint256 a, uint256 b, uint256 c) internal pure returns (PrintPolicy memory p) {
        (p.verifier, p.source, p.graceSec) = (address(uint160(a)), uint8(a >> 160), uint16(a >> 168));
        (p.minDelaySec, p.barLenSec, p.openAdmissionSec) = (uint16(a >> 184), uint16(a >> 200), uint32(a >> 216));
        p.feedId = bytes32(b);
        (p.closeAdmissionSec, p.strictSec, p.maxConfBps) = (uint32(c), uint32(c >> 32), uint16(c >> 64));
        (p.maxAgeSec, p.statusMask) = (uint16(c >> 80), uint8(c >> 96));
    }

    function policyVersion(uint256[] memory w) internal pure returns (PolicyVersion memory v) {
        (v.validFrom, v.validUntil) = (uint40(w[0]), uint40(w[0] >> 40));
        (v.maxDivergenceBps, v.checkAdmissionSec) = (uint16(w[0] >> 80), uint32(w[0] >> 96));
        v.primary = printPolicy(w[1], w[2], w[3]);
        v.check = printPolicy(w[4], w[5], w[6]);
    }

    function market(uint256[] memory w) internal pure returns (Market memory m) {
        (m.tradingStart, m.lockAt, m.expiry) = (uint40(w[0]), uint40(w[0] >> 40), uint40(w[0] >> 80));
        (m.openDeadline, m.closeDeadline, m.seriesIdx) = (uint40(w[0] >> 120), uint40(w[0] >> 160), uint32(w[0] >> 200));
        (m.policyVersion, m.basis) = (uint8(w[0] >> 232), uint8(w[0] >> 240));
        (m.open, m.close, m.checkOpen, m.checkClose) = (uint128(w[1]), uint128(w[1] >> 128), uint128(w[2]), uint128(w[2] >> 128));
        (m.backingLots, m.volumeLots, m.volumeCash, m.tradeCount) = (uint64(w[3]), uint64(w[3] >> 64), uint64(w[3] >> 128), uint64(w[3] >> 192));
        (m.lastPrice, m.lastTradeTs, m.eventSeq) = (uint16(w[4]), uint40(w[4] >> 16), uint48(w[4] >> 56));
        (m.resolvedTs, m.payoutYes, m.payoutNo) = (uint40(w[4] >> 104), uint32(w[4] >> 144), uint32(w[4] >> 176));
        (m.state, m.voidReason, m.flags) = (uint8(w[4] >> 208), uint8(w[4] >> 216), uint8(w[4] >> 224));
        (m.openKind, m.closeKind) = (uint8(w[4] >> 232), uint8(w[4] >> 240));
        (m.index, m.mIdx, m.orderCount) = (uint64(w[5]), uint32(w[5] >> 64), uint32(w[5] >> 96));
    }

    function level(uint256 w) internal pure returns (Level memory l) {
        l = Level(uint32(w), uint32(w >> 32), uint64(w >> 64));
    }

    function node(uint256[] memory w) internal pure returns (Node memory n) {
        (n.owner, n.lots, n.price, n.kind, n.flags) =
            (address(uint160(w[0])), uint64(w[0] >> 160), uint16(w[0] >> 224), uint8(w[0] >> 240), uint8(w[0] >> 248));
        (n.seq, n.expireTs, n.placedAt, n.prev) = (uint48(w[1]), uint32(w[1] >> 48), uint32(w[1] >> 80), uint32(w[1] >> 112));
        (n.next, n.holderPrev, n.holderNext) = (uint32(w[1] >> 144), uint32(w[1] >> 176), uint32(w[1] >> 208));
    }

    function position(uint256[] memory w) internal pure returns (Position memory p) {
        (p.credit, p.lockedCash, p.yesFree, p.noFree) = (uint64(w[0]), uint64(w[0] >> 64), uint64(w[0] >> 128), uint64(w[0] >> 192));
        (p.yesLocked, p.noLocked, p.openOrders) = (uint64(w[1]), uint64(w[1] >> 64), uint16(w[1] >> 128));
        (p.orderHead, p.flags) = (uint32(w[1] >> 144), uint8(w[1] >> 176));
    }
    // forge-lint: disable-end(unsafe-typecast)
}
