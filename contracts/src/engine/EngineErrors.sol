// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/errors.rs.
// Agari's names and codes are kept for the copy map (`@custom:agari` = the Anchor code); reused meanings are fixed
// and Solana-only codes are dropped (A.2 "Errors"). New EVM errors carry `@custom:agari new`.

/// @title Every error the engine, its libraries and its verifiers raise (one ABI for clients to decode).
interface IEngineErrors {
    // ---- 6000 admin / roller ----
    /// @custom:agari 6000
    error InvalidMode();
    /// @custom:agari 6001
    error NotAdmin();
    /// @custom:agari 6002
    error NotRoller();
    /// @custom:agari 6003
    error BadGrid();
    /// @custom:agari 6004
    error BadWindowIndex();
    /// @custom:agari 6005
    error WindowOverlap();
    /// @custom:agari 6006
    error BadAlignment();
    /// @custom:agari 6007
    error BadHorizon();
    /// @custom:agari 6011
    error UnknownPolicyVersion();
    /// @custom:agari 6012
    error PolicyVersionImmutable();
    /// @custom:agari 6013
    error SourceNotCovered();
    /// @custom:agari 6014
    error BadPolicy();
    /// @custom:agari 6015
    error BadSeriesParams();

    // ---- 6100 orders ----
    /// @custom:agari 6100
    error MarketNotTrading();
    /// @custom:agari 6102 — only ever means "not resolved or voided"
    error MarketNotTerminal();
    /// @custom:agari 6103
    error MarketAlreadyTerminal();
    /// @custom:agari 6104
    error InvalidPrice();
    /// @custom:agari 6105
    error InvalidQuantity();
    /// @custom:agari 6106
    error BelowMinLots();
    /// @custom:agari 6107
    error OrderAlreadyExpired();
    /// @custom:agari 6108
    error ExpiryAfterLock();
    /// @custom:agari 6109
    error PostOnlyWouldCross();
    /// @custom:agari 6110
    error ImmediateOrCancelNoFill();
    /// @custom:agari 6111
    error FillOrKillNotFillable();
    /// @custom:agari 6112 — the global node pool is exhausted (uint32)
    error BookFull();
    /// @custom:agari 6114
    error TooManyOpenOrders();
    /// @custom:agari 6116
    error UnknownOrder();
    /// @custom:agari 6117
    error NotOrderOwner();
    /// @custom:agari 6118
    error ReduceNotSmaller();
    /// @custom:agari 6119
    error SelfMatchCancelTaker();
    /// @custom:agari 6120
    error InvalidOrderArgs();
    /// @custom:agari 6121
    error PreOpenTakerRefused();

    // ---- 6200 prints / settle ----
    /// @custom:agari 6200
    error WrongPrintSource();
    /// @custom:agari 6201
    error PrintAlreadyRecorded();
    /// @custom:agari 6202
    error FeedIdMismatch();
    /// @custom:agari 6203
    error InsufficientVerification();
    /// @custom:agari 6204
    error PrintTooEarly();
    /// @custom:agari 6205
    error PrintNotUnique();
    /// @custom:agari 6206
    error PrintTooLate();
    /// @custom:agari 6207
    error ConfidenceTooWide();
    /// @custom:agari 6208
    error BadAttestation();
    /// @custom:agari 6209
    error UnknownAttestor();
    /// @custom:agari 6210
    error BadRedStonePackage();
    /// @custom:agari 6211
    error RedStoneTimestampMismatch();
    /// @custom:agari 6212 — actually raised here (reserved in Agari; T02)
    error UnknownRedStoneSigner();
    /// @custom:agari 6213
    error InsufficientRedStoneSigners();
    /// @custom:agari 6219
    error CrossCheckPending();
    /// @custom:agari 6222
    error PrintsMissing();
    /// @custom:agari 6223
    error SettlementWindowOpen();
    /// @custom:agari 6227
    error InvalidPrintValue();
    /// @custom:agari 6228
    error PrintNotAdjacent();
    /// @custom:agari 6233
    error BadPrintSlot();

    // ---- 6300 sets / cash ----
    /// @custom:agari 6300
    error InsufficientCredit();
    /// @custom:agari 6301
    error InsufficientOutcome();
    /// @custom:agari 6304
    error MathOverflow();

    // ---- new on EVM ----
    /// @custom:agari new — a repeated RedStone signer refuses the whole print (T02)
    error DuplicateRedStoneSigner();
    /// @custom:agari new
    error UnknownMarket();
    /// @custom:agari new
    error UnknownSeries();
    /// @custom:agari new
    error SeriesExists();
    /// @custom:agari new — E-19: no taker fill before the open print (T01, Q-006)
    error OpenPrintMissing();
    /// @custom:agari new — a live order handle of another market
    error OrderMarketMismatch();
    /// @custom:agari new — the receiver's TIP-1028 receive policy refuses the engine's payout (P12)
    error ReceivePolicyBlocked();
    /// @custom:agari new — the holder opted out of third-party `redeemFor` (T09)
    error CrankRefused();
    /// @custom:agari new — a Data Streams report whose window does not contain T
    error DataStreamsWindowMismatch();
    /// @custom:agari new — reserved for status refusals at the product seam (S7 `EngineSeam`)
    error MarketStatusRefused();
    /// @custom:agari new — a Data Streams report version the verifier does not decode
    error UnsupportedReportVersion();
    /// @custom:agari new — `verifySpot`: the spot is older than `maxAgeSec` (or too far in the future)
    error SpotTooOld();
    /// @custom:agari new — a verifier constructed with a bad signer or attestor set
    error BadSignerSet();
    /// @custom:agari new — a second redeem of a drained position (T03; Agari reused SeatMismatch)
    error NothingToRedeem();
}
