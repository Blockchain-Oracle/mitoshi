// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/{constants.rs,state/enums.rs}
// and anchor/crates/agari-common/src/{grid.rs,place_result.rs}. Engine spec: docs/specs/engine.md (App. A.1–A.2).

// ---------------------------------------------------------------------------------------------------------------
// Constants (Agari `constants.rs` + `grid.rs`; Solana-only ones dropped, A.1.6)
// ---------------------------------------------------------------------------------------------------------------

// Ticks in one pair: a YES at `p` and a NO at `1000 − p` cost exactly one pair.
uint64 constant PAIR_TICKS = 1000;
uint16 constant MIN_PRICE_TICKS = 1;
uint16 constant MAX_PRICE_TICKS = 999;
// Payout vector denominator: win `(1e7, 0)`, void `(5e6, 5e6)` — half face, not a refund of cost (E-04).
uint32 constant PAYOUT_DENOMINATOR = 10_000_000;
uint32 constant PAYOUT_VOID = 5_000_000;

uint8 constant MAX_FILLS_CAP = 32;
uint8 constant MAX_EVICTIONS_CAP = 16;
// Expired nodes skipped (not evicted) per placement before matching stops (`STOP_SKIP_CAP`).
uint8 constant MAX_SKIPS = 64;
uint16 constant MAX_OPEN_ORDERS = 16;
uint256 constant MAX_CANCEL_HANDLES = 16;
// Most orders one `cancelAll` or `sweepExpired` call removes.
uint8 constant MAX_REMOVED_PER_CALL = 32;
// Nodes one `sweepExpired` call may visit (the EVM stand-in for Agari's bounded slab scan, F-S2-05).
uint256 constant MAX_SWEEP_VISITS = 256;
uint8 constant MAX_POLICY_VERSIONS = 8;

uint32 constant GAP_CADENCE_SEC = 604_800;
uint32 constant CADENCE_DIVIDES_SEC = 3_600;
uint40 constant MAX_GAP_DURATION_SEC = 432_000;
// `openAdmissionSec` sentinel: the Gap opening print is admissible until `lockAt`.
uint32 constant ADMIT_UNTIL_LOCK = type(uint32).max;
// `PolicyVersion.validUntil` for an open-ended version.
uint40 constant OPEN_ENDED = type(uint40).max;

// Every recorded print is `priceE8 × 10⁻⁸`.
int8 constant PRINT_EXPO = -8;
int8 constant MIN_SOURCE_EXPO = -18;

// Enums in DreamDEX/Agari numbering (A.2), carried as uint8 so a bad byte refuses by name (InvalidOrderArgs, ...).
uint8 constant KIND_BUY_YES = 0;
uint8 constant KIND_SELL_YES = 1;
uint8 constant KIND_BUY_NO = 2;
uint8 constant KIND_SELL_NO = 3;

uint8 constant ORDER_NORMAL = 0;
uint8 constant ORDER_FOK = 1;
uint8 constant ORDER_IOC = 2;
uint8 constant ORDER_POST_ONLY = 3;

uint8 constant SELF_CANCEL_TAKER = 0;
uint8 constant SELF_CANCEL_MAKER = 1;

uint8 constant PATH_DIRECT_YES = 0;
uint8 constant PATH_DIRECT_NO = 1;
uint8 constant PATH_MINT_PAIR = 2;
uint8 constant PATH_BURN_PAIR = 3;

uint8 constant MODE_NORMAL = 0;
uint8 constant MODE_REDUCE_ONLY = 1;
uint8 constant MODE_HALTED = 2;

uint8 constant STOP_FILLED = 0;
uint8 constant STOP_NO_CROSS = 1;
uint8 constant STOP_FILL_CAP = 2;
uint8 constant STOP_SKIP_CAP = 3;
uint8 constant STOP_POST_ONLY_RESTED = 4;

uint8 constant REMOVE_EXPIRED = 0;
uint8 constant REMOVE_SELF_MATCH = 1;
uint8 constant REMOVE_USER_CANCEL = 2;
uint8 constant REMOVE_CANCEL_ALL = 3;
uint8 constant REMOVE_SWEEP = 4;
// T05: a holder's own orders drained by `redeem`/`redeemPartial`/`redeemFor`.
uint8 constant REMOVE_REDEEM_DRAIN = 5;

uint8 constant BASIS_REGULAR = 0;
uint8 constant BASIS_GAP = 1;
uint8 constant BASIS_TOKEN_24X7 = 2;

// Print sources, Agari's numbers kept (A.1.2): 1 (Pyth) and 3 (Switchboard) are reserved.
uint8 constant SOURCE_NONE = 0;
uint8 constant SOURCE_REDSTONE = 2;
uint8 constant SOURCE_ATTESTED = 4;
uint8 constant SOURCE_DATA_STREAMS = 5;

uint8 constant WHICH_OPEN = 0;
uint8 constant WHICH_CLOSE = 1;
uint8 constant WHICH_CHECK_OPEN = 2;
uint8 constant WHICH_CHECK_CLOSE = 3;

// Stored settlement state; Listed/Trading/Locked are derived from the clock.
uint8 constant STATE_OPEN = 0;
uint8 constant STATE_RESOLVED = 1;
uint8 constant STATE_VOIDED = 2;

// Derived status in DreamDEX numbering: Listed 0 / Trading 1 / Locked 2 / (3 unused) / Resolved 4 / Voided 5.
uint8 constant STATUS_LISTED = 0;
uint8 constant STATUS_TRADING = 1;
uint8 constant STATUS_LOCKED = 2;
uint8 constant STATUS_RESOLVED = 4;
uint8 constant STATUS_VOIDED = 5;

uint8 constant VOID_NONE = 0;
uint8 constant VOID_MISSING_PRINT = 1;
uint8 constant VOID_CROSS_CHECK_DIVERGENCE = 2;

uint8 constant WINNER_YES = 0;
uint8 constant WINNER_NO = 1;
uint8 constant WINNER_VOID = 2;

uint8 constant NODE_LIVE = 1;
uint8 constant NODE_FREED = 2;
uint8 constant PRINT_FLAG_COPIED_FROM_PREV = 1;
uint8 constant MARKET_FLAG_SINGLE_SOURCE = 4;

// ---------------------------------------------------------------------------------------------------------------
// Storage structs (A.1.2). Field order is the packing; comments give the slot map.
// ---------------------------------------------------------------------------------------------------------------

/// Slot 0 of the layout.
struct Config {
    uint8 mode;
    uint32 nextMIdx; // last market index handed out (markets are 1-based)
    uint32 highWater; // nodes 1..highWater have ever been allocated
    uint32 freeHead; // 1-based head of the free list (0 = empty)
    uint48 nextSeq; // last order sequence handed out (global, monotonic)
    uint96 totalOwed; // Σ pulled − Σ paid (A.1.1)
}

/// 2 slots.
struct Series {
    uint16 ticker;
    uint8 basis;
    uint32 cadenceSec;
    uint64 lotBase;
    uint64 tickBase;
    uint64 cashUnit; // s0
    uint64 minLots;
    uint64 nextIndex;
    uint40 lastExpiry;
    uint32 minRestSec;
    uint32 maxLeadSec;
    uint8 fillsCap;
    uint8 evictionsCap;
    uint8 versionCount; // s1
}

/// How one source must prove a print. 3 slots.
struct PrintPolicy {
    address verifier;
    uint8 source;
    uint16 graceSec;
    uint16 minDelaySec;
    uint16 barLenSec;
    uint32 openAdmissionSec; // s0
    bytes32 feedId; // s1
    uint32 closeAdmissionSec;
    uint32 strictSec;
    uint16 maxConfBps;
    uint16 maxAgeSec;
    uint8 statusMask; // s2
}

/// One dated, immutable policy version of a Series (PD-1). 7 slots, append-only.
struct PolicyVersion {
    uint40 validFrom; // inclusive
    uint40 validUntil; // inclusive; OPEN_ENDED = no end
    uint16 maxDivergenceBps;
    uint32 checkAdmissionSec; // s0
    PrintPolicy primary; // s1-s3
    PrintPolicy check; // s4-s6; source NONE = no check
}

/// A recorded print, normalized to expo −8 (`source == SOURCE_NONE` = empty). 128 bits; stored packed (PrintLib).
struct Print {
    int64 priceE8;
    uint40 sourceTs;
    uint8 source;
    uint8 signers;
    uint8 flags;
}

/// The Window. 6 slots, kept forever (results live here; A.1.2).
struct Market {
    uint40 tradingStart; // open boundary T
    uint40 lockAt;
    uint40 expiry; // close boundary T
    uint40 openDeadline;
    uint40 closeDeadline;
    uint32 seriesIdx;
    uint8 policyVersion;
    uint8 basis; // s0
    uint128 open;
    uint128 close; // s1 (packed Print)
    uint128 checkOpen;
    uint128 checkClose; // s2
    uint64 backingLots;
    uint64 volumeLots;
    uint64 volumeCash;
    uint64 tradeCount; // s3
    uint16 lastPrice;
    uint40 lastTradeTs;
    uint48 eventSeq;
    uint40 resolvedTs;
    uint32 payoutYes;
    uint32 payoutNo;
    uint8 state;
    uint8 voidReason;
    uint8 flags;
    uint8 openKind;
    uint8 closeKind; // s4
    uint64 index;
    uint32 mIdx;
    uint32 orderCount; // s5
}

/// One price level: FIFO list of node indices (oldest → newest) and the lots resting there. 1 slot.
struct Level {
    uint32 head;
    uint32 tail;
    uint64 liveLots;
}

/// A resting order in the global recycled pool (A.1.3). 2 slots; a freed node keeps both slots non-zero.
struct Node {
    address owner;
    uint64 lots; // remaining
    uint16 price;
    uint8 kind;
    uint8 flags; // s0
    uint48 seq;
    uint32 expireTs;
    uint32 placedAt;
    uint32 prev;
    uint32 next; // FIFO at its level; the free list when freed
    uint32 holderPrev;
    uint32 holderNext; // s1
}

/// One holder in one market. Slot A is all a plain taker touches (D-011).
struct Position {
    uint64 credit;
    uint64 lockedCash;
    uint64 yesFree;
    uint64 noFree; // slot A
    uint64 yesLocked;
    uint64 noLocked;
    uint16 openOrders;
    uint32 orderHead;
    uint8 flags; // slot B
}

// ---------------------------------------------------------------------------------------------------------------
// Call types (A.2)
// ---------------------------------------------------------------------------------------------------------------

struct PlaceArgs {
    bytes32 marketId;
    uint8 kind;
    uint8 orderType;
    uint8 selfMatch;
    uint16 priceTicks;
    uint64 lots;
    uint40 expireTs;
    uint8 maxFills;
    uint8 maxEvictions;
    bool useCredit;
    bool withdrawProceeds;
    uint64 clientId;
}

/// What `placeOrder` did (E-60): returned to contract callers **and** emitted in `OrderExecuted`.
struct PlaceResult {
    uint64 filledLots;
    uint64 cashSpent;
    uint64 cashReceived;
    uint64 creditUsed;
    uint64 transferredIn;
    uint64 withdrawn;
    uint64 refunded; // escrow never pulled (better-than-limit fills, the cancelled remainder); a report only
    uint64 restedLots;
    uint64 cancelledLots;
    uint128 restedOrderId; // 0 = nothing rested
    uint8 fills;
    uint8 evictions;
    uint8 selfCancels;
    uint8 stopReason;
    uint8 pathMask; // one bit per path used
}

/// The engine picks the highest policy version covering both boundaries itself (E-26 step 10).
struct OpenWindowArgs {
    bytes32 seriesId;
    uint64 index;
    uint40 tradingStart;
    uint40 lockAt;
    uint40 expiry;
    uint8 openKind;
    uint8 closeKind;
}

struct RegisterSeriesArgs {
    uint16 ticker;
    uint8 basis;
    uint32 cadenceSec;
    uint64 lotBase;
    uint64 tickBase;
    uint64 minLots;
    uint32 minRestSec;
    uint32 maxLeadSec;
    uint8 fillsCap;
    uint8 evictionsCap;
}
