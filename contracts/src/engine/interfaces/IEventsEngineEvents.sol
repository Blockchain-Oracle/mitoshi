// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PlaceResult} from "../EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/events.rs (reshaped per
// E-61: per-fill and per-removal logs instead of batched records; indexed `marketId`).

/// @title Engine events. Every market-scoped call takes one `seq = ++eventSeq` and stamps it on every event it emits,
///        so `(marketId, seq)` has no gaps across calls (the indexer's gap check, D-030).
interface IEventsEngineEvents {
    // ---- admin ----
    event SeriesRegistered(
        bytes32 indexed seriesId, uint16 ticker, uint8 basis, uint32 cadenceSec, uint64 lotBase, uint64 tickBase, uint64 cashUnit
    );
    event PolicyVersionAdded(
        bytes32 indexed seriesId, uint8 index, uint40 validFrom, uint40 validUntil, uint8 primarySource, uint8 checkSource
    );
    event ModeSet(uint8 mode);
    event RollerSet(address indexed roller, bool enabled);
    event AdminTransferStarted(address indexed current, address indexed pending);
    event AdminTransferred(address indexed previous, address indexed current);
    event NodesReserved(uint32 added, uint32 highWater);
    event SurplusSwept(address indexed treasury, uint256 amount);
    event CrankOptOutSet(address indexed holder, bool optedOut);

    // ---- market lifecycle ----
    event WindowOpened(
        bytes32 indexed marketId,
        uint48 seq,
        bytes32 indexed seriesId,
        uint64 index,
        uint32 mIdx,
        uint40 tradingStart,
        uint40 lockAt,
        uint40 expiry,
        uint40 openDeadline,
        uint40 closeDeadline,
        uint8 policyVersion,
        uint8 openKind,
        uint8 closeKind,
        uint8 basis
    );

    // ---- trading ----
    event OrderExecuted(
        bytes32 indexed marketId,
        uint48 seq,
        address indexed taker,
        uint8 kind,
        uint8 orderType,
        uint8 selfMatch,
        uint16 limitTicks,
        uint64 lots,
        uint40 expireTs,
        uint64 clientId,
        PlaceResult result,
        uint64 backingLots
    );
    /// One fill at the maker's price; both owners and the path in one record (C06:273).
    event Fill(
        bytes32 indexed marketId,
        uint48 seq,
        address indexed maker,
        address indexed taker,
        uint128 makerOrderId,
        uint8 makerKind,
        uint8 takerKind,
        uint8 path,
        uint16 priceTicks,
        uint64 lots,
        uint64 makerRemaining
    );
    event OrderRemoved(
        bytes32 indexed marketId,
        uint48 seq,
        address indexed owner,
        uint128 orderId,
        uint8 kind,
        uint16 priceTicks,
        uint64 lots,
        uint8 reason
    );
    event OrderReduced(bytes32 indexed marketId, uint48 seq, address indexed owner, uint128 orderId, uint64 oldLots, uint64 newLots);
    /// Summary of a cancel / cancel-all / sweep call (Agari `OrdersCancelled`); the removals are `OrderRemoved` logs.
    event OrdersCancelled(
        bytes32 indexed marketId, uint48 seq, address indexed caller, uint8 reason, uint32 removed, uint32 skipped, uint64 withdrawn
    );
    event CompleteSet(
        bytes32 indexed marketId,
        uint48 seq,
        address indexed owner,
        bool minted,
        uint64 lots,
        uint64 cash,
        uint64 creditUsed,
        uint64 transferredIn,
        uint64 withdrawn,
        uint64 backingLots
    );
    event CreditWithdrawn(bytes32 indexed marketId, uint48 seq, address indexed owner, uint64 amount);

    // ---- prints and settlement ----
    event PrintRecorded(
        bytes32 indexed marketId,
        uint48 seq,
        uint8 which,
        uint8 source,
        int64 priceE8,
        uint40 sourceTs,
        uint8 signers,
        bool copied
    );
    event WindowResolved(
        bytes32 indexed marketId,
        uint48 seq,
        uint8 state,
        uint8 winner,
        uint32 payoutYes,
        uint32 payoutNo,
        uint8 voidReason,
        bool singleSource,
        int64 openE8,
        int64 closeE8
    );
    event Redeemed(
        bytes32 indexed marketId,
        uint48 seq,
        address indexed holder,
        address indexed by,
        uint64 yesLots,
        uint64 noLots,
        uint64 payout,
        uint64 credit,
        uint64 total,
        bool isPartial,
        bool heldAsCredit
    );
}
