// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/leverage/ILeverageReserve.sol
// Seam edits (docs/specs/engine.md A.4.3): `Params` gains `minRestSec` (the knock-out and the at-birth checks walk rested
// depth, PD-2a) and `fairSlackRaw` (PD-2b: how far above the fair-value model an entry may be bought); errors
// `WrongLens`, `WrongGuard`, `VoidWouldShort` (Agari D-116), `UnhealthyAtEntry` (D-114), `AboveFairValue` and
// `FairValueHealthy` (PD-2, Q-022) — Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-leverage.

/// @title LeverageReserve's public vocabulary — positions, params, events and errors.
/// @notice One interface so the adapter, the keeper, the tests and the contract read the same ABI.
interface ILeverageReserve {
    /// @dev LIVE while the reserve holds the contracts; CLOSED by the owner's own cash-out; KNOCKED_OUT
    ///      when the mark fell to the maintenance line and anyone sold it; SETTLED on the engine's verdict.
    enum PositionStatus {
        LIVE,
        CLOSED,
        KNOCKED_OUT,
        SETTLED
    }

    struct Position {
        address owner;
        PositionStatus status;
        uint8 outcomeIdx;
        uint32 leverageBps;
        bytes32 marketId;
        uint64 openedAtSec;
        uint64 expirySec;
        uint64 exitedAtSec;
        /// @dev Contracts the reserve still holds for this position, raw.
        uint256 quantityRaw;
        /// @dev What the owner put in, premium included — the most they can lose.
        uint256 stake;
        /// @dev The reserve's outstanding claim, repaid first out of whatever the contracts fetch.
        uint256 fronted;
        uint256 premium;
        /// @dev Collateral per whole contract paid at open, in the bought side's own terms.
        uint256 entryPriceRaw;
        /// @dev Cumulative: what the contracts fetched, what the reserve took back, what the owner received.
        uint256 proceeds;
        uint256 reclaimed;
        uint256 returned;
    }

    struct Params {
        /// @dev 20_000 = 2×. Exposure is `leverageBps / BPS` of the stake.
        uint32 maxLeverageBps;
        /// @dev Charged on the fronted amount at open and kept whatever happens — the reserve's gap-risk fee.
        uint16 premiumBps;
        /// @dev The knock-out line: anyone may sell a position once `mark × BPS < fronted × maintenanceBps`.
        uint16 maintenanceBps;
        /// @dev Aggregate fronted cap as a fraction of total value.
        uint16 maxExposureBps;
        /// @dev Entry only inside this band, in the bought side's own terms: no boost on a decided Window.
        uint256 minEntryPriceRaw;
        uint256 maxEntryPriceRaw;
        uint256 maxFrontedPerPosition;
        /// @dev Fronted cap per Window: every boost on one print loses together.
        uint256 maxWindowFronted;
        uint32 maxOpenPositions;
        /// @dev No opens inside the last seconds before a Window locks, where the knock-out cannot act.
        uint32 minTimeLeftSec;
        /// @dev PD-2a: the knock-out and the at-birth walks count orders rested at least max(Series, this).
        uint32 minRestSec;
        /// @dev PD-2b: an entry refuses when its price is more than this above the fair-value model's, per whole unit.
        uint256 fairSlackRaw;
    }

    /// @dev What a book walk decides before any money moves — the contract's own quote.
    struct Preview {
        uint256 quantityRaw;
        uint256 costRaw;
        uint256 filledRaw;
        /// @dev The worst level the walk touched, in the venue's YES terms — the IOC's limit.
        uint256 limitYesRaw;
        /// @dev Cost-weighted price per whole contract, in the bought side's own terms.
        uint256 priceRaw;
        uint256 stake;
        uint256 fronted;
        uint256 premium;
        /// @dev `quantity − fronted`: what the owner collects if the side lands.
        uint256 winIfRight;
    }

    event Supplied(address indexed who, uint256 amount, uint256 shares, uint256 liquid);
    event SupplyRedeemed(address indexed who, uint256 amount, uint256 shares, uint256 liquid);
    event ParamsUpdated(Params params);
    event PausedSet(bool paused);
    event AdminChanged(address indexed admin);
    /// @dev Carries the market id only — never an engine address (AD-10).
    event Opened(
        uint256 indexed positionId,
        address indexed owner,
        bytes32 indexed marketId,
        uint8 outcomeIdx,
        uint32 leverageBps,
        uint256 quantityRaw,
        uint256 stake,
        uint256 fronted,
        uint256 premium,
        uint256 costRaw
    );
    event Exited(
        uint256 indexed positionId,
        address indexed owner,
        PositionStatus status,
        uint256 quantitySoldRaw,
        uint256 proceeds,
        uint256 reclaimed,
        uint256 returned,
        address by
    );
    event Swept(uint256 amount);

    error NotAdmin(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error BadParams();
    error IsPaused();
    error UnknownMarket(bytes32 marketId);
    error WrongCollateral(address got);
    error WrongLens(address lens);
    error WrongGuard(address guard);
    error BadOutcome(uint8 outcomeIdx);
    error MarketNotTrading(bytes32 marketId, uint8 status);
    error TooLate(bytes32 marketId, uint64 lockAtSec);
    error BadLeverage(uint32 leverageBps, uint32 maxLeverageBps);
    error ThinBook(bytes32 marketId, uint256 availableRaw, uint256 neededRaw);
    error OutsideBand(uint256 priceRaw, uint256 minPriceRaw, uint256 maxPriceRaw);
    error BelowMinQuantity(uint256 quantityRaw, uint256 minQuantityRaw);
    error StakeAboveMax(uint256 stake, uint256 maxStake);
    error Underpriced(uint256 stake, uint256 winIfRight);
    /// @dev D-116: a void pays half a contract, so the front must fit inside it: `fronted × 1e7 ≤ quantity × 5e6`.
    error VoidWouldShort(uint256 fronted, uint256 quantityRaw);
    /// @dev D-114: at birth, the whole size must sell over rested depth at a mark above the knock-out line.
    error UnhealthyAtEntry(uint256 markRaw, uint256 lineRaw);
    /// @dev PD-2: the entry is bought more than `fairSlackRaw` above the fair-value model's price for that side.
    error AboveFairValue(bytes32 marketId, uint256 priceRaw, uint256 fairRaw);
    error OverPositionCap(uint256 fronted, uint256 cap);
    error OverWindowCap(bytes32 marketId, uint256 wouldBe, uint256 cap);
    error OverExposure(uint256 wouldBeOutstanding, uint256 totalValue, uint16 maxExposureBps);
    error TooManyOpen(uint32 open, uint32 cap);
    error InsufficientLiquidity(uint256 needed, uint256 liquid);
    error InsufficientShares(uint256 requested, uint256 held);
    error NothingFilled(bytes32 marketId);
    error NoSuchPosition(uint256 positionId);
    error NotOwner(uint256 positionId, address caller);
    error NotLive(uint256 positionId, PositionStatus status);
    error StillHealthy(uint256 positionId, uint256 markRaw, uint256 lineRaw);
    /// @dev PD-2 (Q-022): the book says knock out, the fair-value model on a verified spot says the position is healthy.
    error FairValueHealthy(uint256 positionId, uint256 fairMarkRaw, uint256 lineRaw);
    error Slippage(uint256 proceeds, uint256 minProceeds);
    error MarketNotSettled(bytes32 marketId);
    error UnsettledPosition(uint256 positionId);
}
