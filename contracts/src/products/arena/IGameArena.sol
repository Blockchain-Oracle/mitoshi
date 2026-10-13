// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/games/IGameArena.sol (R4-9, D-227). Seam edits: the arena trades on
// Mitoshi's engine by market id (EngineSeam), so the venue pin and `WrongVenue` are gone (one engine, one collateral,
// checked at construction: `WrongCollateral`, `WrongLens`); `AgentFunded` is gone (Tempo has no native value — the
// agent's gas is the relay's or its own fee token); the per-call `Swept` is the engine credit `sweep` collects.

/// @title GameArena's public vocabulary — matches, picks, tiers, events and errors.
/// @notice One interface so the adapter, the tests and the contract read the same ABI. The enums are
///         declared in the order `masayume/core/games` declares them (`types.ts` §ArenaStatus,
///         `lifecycle.ts` §RefundReason), so an ABI decode and a TypeScript literal cannot drift.
interface IGameArena {
    /// @dev WAITING until a challenger joins; ACTIVE_UNREVEALED until the deck is opened; PICKING while
    ///      both players still owe cards; then SETTLING (both complete), FORFEITED (one absent) or
    ///      REFUNDED (nobody's fault). FINALIZED is the pot's terminal state — cards may settle in any of
    ///      the last four, because a match that lost its pot still owns real positions on the book.
    enum Status {
        WAITING,
        ACTIVE_UNREVEALED,
        PICKING,
        SETTLING,
        FINALIZED,
        REFUNDED,
        FORFEITED
    }

    /// @dev Why a pot went home instead of being won. Order matches core's `RefundReason` union.
    enum RefundReason {
        CREATOR_CANCELLED,
        JOIN_TIMEOUT,
        REVEAL_UNAVAILABLE,
        BOTH_INCOMPLETE
    }

    /// @dev One entry price. `potBase` is what each player escrows; `perCardCapBase` is the most one card's
    ///      market order may spend, so a five-card deck cannot cost more than five times the cap.
    ///      Free is a tier with `potBase == 0` — its picks are still real orders.
    struct Tier {
        uint128 potBase;
        uint128 perCardCapBase;
        bool enabled;
    }

    struct Params {
        /// @dev How long a created match waits for a challenger, a joined one for its deck, and a
        ///      revealed one for both players' picks.
        uint32 joinWindowSec;
        uint32 revealWindowSec;
        uint32 pickWindowSec;
        uint8 minDeckSize;
        uint8 maxDeckSize;
        /// @dev At reveal every card's Window must still have this long to run, and no pick is accepted
        ///      inside it either: a deck of Windows about to lock is a deck nobody can play.
        uint32 minCardLifeSec;
    }

    /// @dev The immutable half of a match. `creator` and `challenger` are the payout addresses too —
    ///      they are never rewritten, so a compromised session key cannot redirect a pot (AD-5).
    struct Match {
        address creator;
        uint8 tier;
        Status status;
        uint8 deckSize;
        /// @dev One bit per card, per seat: set when that seat's pick is on the book.
        uint8 pickedMask0;
        address challenger;
        uint8 pickedMask1;
        /// @dev One bit per card: set when both seats' picks on it have been redeemed.
        uint8 settledMask;
        /// @dev Bumped whenever the deck-selection rules change; part of the commitment preimage.
        uint32 policyVersion;
        bytes32 deckHash;
        uint64 createdAtSec;
        uint64 joinedAtSec;
        uint64 revealedAtSec;
        uint64 pickDeadlineSec;
        uint128 potBase;
        uint128 perCardCapBase;
    }

    /// @dev What the arena measured around one IOC. `costBase` and `quantity` are deltas of the arena's
    ///      own cash and engine position (EngineSeam) — never the quote the player was shown.
    struct PickRecord {
        bool placed;
        bool settled;
        uint8 outcomeIdx;
        uint128 quantity;
        uint128 costBase;
        uint128 payoutBase;
    }

    /// @dev A match-scoped delegate for one seat: the key the player named, until when, and the deck's own
    ///      ceiling on what it may hand the arena in stakes (`perCardCapBase × deckSize`, booked gross).
    struct Agent {
        address agent;
        uint64 expiresAtSec;
        uint128 budgetBase;
        uint128 spentBase;
    }

    /// @dev A size read off the live book for a stake: what it buys, what that costs, and the limit the
    ///      IOC will carry.
    struct Quote {
        uint256 quantityRaw;
        uint256 costRaw;
        uint256 limitYesRaw;
        uint256 priceRaw;
    }

    event ParamsUpdated(Params params);
    event TierSet(uint8 indexed tier, uint128 potBase, uint128 perCardCapBase, bool enabled);
    event PausedSet(bool paused);
    event AdminChanged(address indexed admin);
    event Swept(uint256 amount);

    /// @dev Every economic event carries `matchId`; none carries a pool or market address (AD-10).
    event MatchCreated(bytes32 indexed matchId, address indexed creator, uint8 tier, uint128 potBase, bytes32 deckHash, uint8 deckSize, uint64 joinDeadlineSec);
    event MatchJoined(bytes32 indexed matchId, address indexed challenger, uint128 potBase, uint64 revealDeadlineSec);
    event DeckRevealed(bytes32 indexed matchId, uint32 policyVersion, bytes32[] cards, uint64 pickDeadlineSec);
    event PickFilled(
        bytes32 indexed matchId,
        address indexed player,
        bytes32 indexed marketId,
        uint8 cardIndex,
        uint8 outcomeIdx,
        uint256 quantity,
        uint256 costBase,
        uint256 refundBase
    );
    event CardSettled(bytes32 indexed matchId, address indexed player, bytes32 indexed marketId, uint8 cardIndex, uint256 payoutBase, int256 pnlBase);
    event PicksLocked(bytes32 indexed matchId, Status status, address forfeitedBy);
    event MatchFinalized(bytes32 indexed matchId, address winner, int256 creatorPnlBase, int256 challengerPnlBase, uint256 potAwarded);
    event MatchRefunded(bytes32 indexed matchId, RefundReason reason, uint256 perPlayerBase);
    event CreditClaimed(address indexed player, uint256 amount, address by);
    /// @dev `agent == 0` is a revocation. Emitted by the entry transaction that named the key and by `authorizeAgent`.
    event AgentAuthorized(bytes32 indexed matchId, address indexed player, address indexed agent, uint64 expiresAtSec, uint128 budgetBase);

    error NotAdmin(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error BadParams();
    error IsPaused();
    error UnknownMarket(bytes32 marketId);
    error WrongCollateral(address got);
    error WrongLens(address lens);
    error BadOutcome(uint8 outcomeIdx);
    error MarketNotTrading(bytes32 marketId, uint8 status);
    error MarketNotSettled(bytes32 marketId);
    error TooLate(bytes32 marketId, uint64 expirySec);
    error BelowMinQuantity(uint256 got, uint256 want);
    error CostAboveStake(uint256 cost, uint256 stake);
    error StakeAboveCap(uint256 stake, uint256 cap);

    error MatchExists(bytes32 matchId);
    error NoSuchMatch(bytes32 matchId);
    error WrongStatus(bytes32 matchId, Status got);
    error UnknownTier(uint8 tier);
    error BadDeckSize(uint8 size);
    error DuplicateCard(bytes32 marketId);
    error DeckMismatch(bytes32 want, bytes32 got);
    error NotAPlayer(address caller);
    error SelfJoin();
    error DeadlinePassed(uint64 deadlineSec);
    error DeadlineNotPassed(uint64 deadlineSec);
    error BadCard(uint8 cardIndex);
    error AlreadyPicked(bytes32 matchId, uint8 cardIndex, address player);
    error NotPicked(bytes32 matchId, uint8 cardIndex, address player);
    error AlreadySettled(bytes32 matchId, uint8 cardIndex);
    error CardsOutstanding(bytes32 matchId);
    error NoCredit(address player);
    error Overflow(uint256 value);

    error NotAgent(bytes32 matchId, address player, address caller);
    error AgentExpired(bytes32 matchId, uint64 expiresAtSec);
    error AgentOverBudget(bytes32 matchId, uint256 spent, uint256 budget);
    error BadTtl(uint32 ttlSec);
}
