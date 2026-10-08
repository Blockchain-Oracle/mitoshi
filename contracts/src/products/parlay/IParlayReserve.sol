// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/parlay/IParlayReserve.sol
// Seam edits (docs/specs/engine.md A.4.6): `Params` gains `minRestSec` (D-109: legs priced over rested depth only, at
// max(Series, params)) and `fairSlackRaw` (PD-2: how far below the fair-value model a leg's book price may sit);
// errors `WrongLens`, `WrongGuard`, `LegOutOfOrder` (D-108), `BelowFairValue` / `BadProofCount` (PD-2); event
// `ExpiryReleased` (L-38: a boundary's lock is released when its last pending leg is decided). `WrongCollateral`
// now names the engine's collateral, checked once at construction (A.2.7).

/// @title ParlayReserve's public vocabulary — legs, tickets, params, events and errors.
/// @notice One interface so the adapter, the tests and the contract read the same ABI.
interface IParlayReserve {
    /// @dev LIVE while any leg is pending; WON once every leg has; LOST or VOID the instant one leg
    ///      is; CLAIMED after a won ticket's payout has left.
    enum ParlayStatus {
        LIVE,
        WON,
        LOST,
        VOID,
        CLAIMED
    }

    enum LegStatus {
        PENDING,
        WON,
        LOST,
        VOID
    }

    /// @dev A leg as the opener names it: a Window and a side. Its price is the book's, read on-chain at open.
    struct LegInput {
        bytes32 marketId;
        uint8 outcomeIdx;
    }

    struct Leg {
        bytes32 marketId;
        uint8 outcomeIdx;
        LegStatus status;
        uint64 expirySec;
        uint64 resolvedAtSec;
        /// @dev Collateral per whole contract of the chosen side, read off the pool's book at open —
        ///      the leg's priced win probability, kept for audit exactly as the reference keeps `prob_bps`.
        uint256 priceRaw;
    }

    struct Parlay {
        address owner;
        ParlayStatus status;
        uint8 legCount;
        uint8 wonCount;
        uint64 openedAtSec;
        /// @dev max(leg.expirySec): when the last leg can settle.
        uint64 lastExpirySec;
        uint256 stake;
        uint256 maxPayout;
        /// @dev `maxPayout - stake`: the reserve's contingent contribution, escrowed at open.
        uint256 houseLocked;
        /// @dev The combined (surcharged) win probability recomputed on-chain, per whole unit of collateral.
        uint256 combinedProbRaw;
    }

    struct Params {
        /// @dev House edge over fair value.
        uint16 marginBps;
        /// @dev Aggregate `locked` cap as a fraction of total value.
        uint16 maxExposureBps;
        /// @dev Same-expiry correlation floor λ: combined ≥ λ · min leg probability.
        uint16 correlationBps;
        uint8 maxLegs;
        /// @dev Per-ticket jackpot cap, base units.
        uint256 maxPayoutCap;
        /// @dev Per-expiry aggregate contingent-liability cap, base units.
        uint256 maxExpiryLocked;
        /// @dev Reject ultra-longshots: least combined (surcharged) probability, per whole unit.
        uint256 minCombinedProbRaw;
        /// @dev The least depth (raw contracts) a leg is priced over; a bigger payout is priced over its own size.
        uint256 priceDepthRaw;
        /// @dev D-109: a leg is priced only over orders rested at least max(the Series' `minRestSec`, this).
        uint32 minRestSec;
        /// @dev PD-2: a leg refuses when its book price is more than this below the fair-value model's, per whole unit.
        uint256 fairSlackRaw;
    }

    event Supplied(address indexed who, uint256 amount, uint256 shares, uint256 liquid);
    event SupplyRedeemed(address indexed who, uint256 amount, uint256 shares, uint256 liquid);
    event ParamsUpdated(Params params);
    event PausedSet(bool paused);
    event AdminChanged(address indexed admin);
    /// @dev Carries market ids only — never a pool or market address (AD-10).
    event ParlayOpened(
        uint256 indexed parlayId, address indexed owner, uint8 legCount, uint256 stake, uint256 maxPayout, uint256 combinedProbRaw, uint64 lastExpirySec
    );
    event LegPriced(uint256 indexed parlayId, uint8 legIdx, bytes32 indexed marketId, uint8 outcomeIdx, uint256 priceRaw, uint64 expirySec);
    event LegResolved(uint256 indexed parlayId, uint8 legIdx, bytes32 indexed marketId, LegStatus status, address by);
    event ParlayWon(uint256 indexed parlayId, address indexed owner, uint256 payout);
    event ParlayLost(uint256 indexed parlayId, address indexed owner, uint256 kept, uint8 onLeg);
    event ParlayVoided(uint256 indexed parlayId, address indexed owner, uint256 refund, uint8 onLeg);
    event ParlayClaimed(uint256 indexed parlayId, address indexed owner, uint256 payout, address by);
    /// @dev L-38: `amount` of a ticket's contingent liability left `lockedByExpiry[expirySec]` early — the ticket's last
    ///      pending leg at that instant was decided and won, so nothing more can ride on that print.
    event ExpiryReleased(uint256 indexed parlayId, uint64 expirySec, uint256 amount);

    error NotAdmin(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error BadParams();
    error IsPaused();
    error BadLegCount(uint256 count);
    error DuplicateMarket(bytes32 marketId);
    error UnknownMarket(bytes32 marketId);
    error WrongCollateral(address got);
    error BadOutcome(uint8 outcomeIdx);
    error MarketNotTrading(bytes32 marketId, uint8 status);
    error LegExpired(bytes32 marketId, uint64 expirySec);
    error ThinBook(bytes32 marketId, uint256 availableRaw, uint256 neededRaw);
    error LongShot(uint256 combinedProbRaw, uint256 minCombinedProbRaw);
    error OverPayoutCap(uint256 maxPayout, uint256 cap);
    error StakeAboveMax(uint256 stake, uint256 maxStake);
    error Underpriced(uint256 stake, uint256 maxPayout);
    error InsufficientLiquidity(uint256 needed, uint256 liquid);
    error OverExposure(uint256 wouldBeLocked, uint256 totalValue, uint16 maxExposureBps);
    error OverExpiryCap(uint64 expirySec, uint256 wouldBe, uint256 cap);
    error NoSuchParlay(uint256 parlayId);
    error NoSuchLeg(uint256 parlayId, uint256 legIdx);
    error MarketNotSettled(bytes32 marketId);
    error NotWon(uint256 parlayId, ParlayStatus status);
    error InsufficientShares(uint256 requested, uint256 held);
    error WrongLens(address lens);
    error WrongGuard(address guard);
    /// @dev D-108: legs are decided in the order their Windows settle (earliest `expirySec`, lowest index on a tie).
    error LegOutOfOrder(uint256 parlayId, uint256 legIdx, uint256 nextLegIdx);
    /// @dev PD-2: the book prices this leg below the oracle fair-value model by more than `fairSlackRaw`.
    error BelowFairValue(bytes32 marketId, uint256 priceRaw, uint256 fairRaw);
    error BadProofCount(uint256 proofs, uint256 legs);
}
