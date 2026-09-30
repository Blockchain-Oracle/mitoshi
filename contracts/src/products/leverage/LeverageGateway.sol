// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/leverage/LeverageGateway.sol
// Seam edits (docs/specs/engine.md A.4.3, A.4 shared): the DreamDEX module/pool/ERC-6909 become the engine + lens by
// market id; every IOC goes through `EngineSeam.placeMeasured` (the engine's report checked against the money, else
// `EngineAccountingMismatch` — Agari D-114) and a settlement through `redeemPartialMeasured`; `_expireSec = min(now+60,
// lockAt)`; book walks read `lens.levelsRaw(…, rested ? max(Series, params) minRestSec : 0)` and the size grid
// `lens.grid`; `TooLate` counts to `lockAt` (T08); D-116 `VoidWouldShort` on the quoted terms; PD-2 `_checkEntry`
// refuses `AboveFairValue` on a same-call signed spot through the FairValueGuard. `sweep(bytes32 marketId)` replaces
// `sweep(address pool)`. The constructor checks the engine's collateral, the lens and the guard, approves the engine
// once and opts out of third-party cranks (D-015); `setOperator` is gone (positions live in the engine's ledger).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef, LevelRaw} from "../../engine/interfaces/IEngineLens.sol";
import {
    PlaceArgs,
    KIND_BUY_YES,
    KIND_SELL_YES,
    KIND_BUY_NO,
    KIND_SELL_NO,
    ORDER_IOC,
    SELF_CANCEL_TAKER,
    STATUS_TRADING,
    PAYOUT_DENOMINATOR,
    PAYOUT_VOID
} from "../../engine/EngineTypes.sol";
import {FairValue} from "../../fair/FairValue.sol";
import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {EngineSeam} from "../shared/EngineSeam.sol";
import {ILeverageReserve} from "./ILeverageReserve.sol";
import {LeverageMath} from "./LeverageMath.sol";

/// @title The leverage reserve's one seam to the engine, and its tunables.
/// @notice The reserve is the venue's taker on the owner's behalf: it buys the boosted position off the book as
///         itself, holds the contracts in its own engine position, and sells them the same way when the owner cashes
///         out or the mark reaches the knock-out line, or redeems them when the Window settles. Every figure it books
///         is the measured delta of its own cash and position around the engine call.
/// @dev Nothing here stores or emits an engine address (AD-10).
abstract contract LeverageGateway is ILeverageReserve {
    using SafeERC20 for IERC20;

    uint40 internal constant IOC_LIFE_SEC = 60;
    /// @dev Levels read per side when walking a book; a book thinner than the walk over these refuses.
    uint64 internal constant LEVELS = 32;
    uint256 internal constant MAX_NODES = 256;
    uint256 internal constant BPS = LeverageMath.BPS;

    IERC20 public immutable collateral;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    FairValueGuard public immutable guard;
    /// @dev One whole unit of collateral (10^decimals); prices are collateral per whole contract.
    uint256 public immutable one;

    address public admin;
    bool public paused;
    Params public params;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, FairValueGuard guard_, Params memory params_) {
        address coll = engine_.collateral();
        if (coll != address(collateral_)) revert WrongCollateral(coll);
        if (lens_.engine() != address(engine_)) revert WrongLens(address(lens_));
        if (address(guard_.lens()) != address(lens_)) revert WrongGuard(address(guard_));
        collateral = collateral_;
        engine = engine_;
        lens = lens_;
        guard = guard_;
        one = 10 ** IERC20Metadata(address(collateral_)).decimals();
        admin = msg.sender;
        _setParams(params_);
        collateral_.forceApprove(address(engine_), type(uint256).max);
        engine_.setCrankOptOut(true);
    }

    // ------------------------------------------------------------------ admin

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    /// @notice Tunables only. Open positions keep the terms they were opened on; the knock-out line follows.
    function setParams(Params calldata next) external onlyAdmin {
        _setParams(next);
    }

    /// @notice Pauses new positions and new supply. Cash-outs, knock-outs, settlement and withdrawals never pause.
    function setPaused(bool next) external onlyAdmin {
        paused = next;
        emit PausedSet(next);
    }

    function setAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert ZeroAddress();
        admin = next;
        emit AdminChanged(next);
    }

    function _setParams(Params memory p) internal {
        if (p.maxLeverageBps <= BPS || p.premiumBps >= BPS || p.maintenanceBps < BPS || p.maxExposureBps > BPS) revert BadParams();
        if (p.minEntryPriceRaw == 0 || p.maxEntryPriceRaw <= p.minEntryPriceRaw || p.maxEntryPriceRaw >= one) revert BadParams();
        if (p.maxFrontedPerPosition == 0 || p.maxWindowFronted == 0 || p.maxOpenPositions == 0 || p.maxOpenPositions > 256) revert BadParams();
        if (p.minTimeLeftSec == 0 || p.fairSlackRaw > one) revert BadParams();
        params = p;
        emit ParamsUpdated(p);
    }

    // ------------------------------------------------------------------ the venue

    /// @notice Moves the reserve's own engine credit on `marketId` into its wallet. Anyone may call; the credit is the
    ///         reserve's either way (the real engine never leaves it one: IOC + `withdrawProceeds`).
    function sweep(bytes32 marketId) external returns (uint256 amount) {
        amount = EngineSeam.collectCreditMeasured(engine, lens, collateral, marketId);
        if (amount != 0) {
            _booked(amount);
            emit Swept(amount);
        }
    }

    /// @dev Books collateral that arrived outside a position's flow (a swept credit) as the suppliers'.
    function _booked(uint256 amount) internal virtual;

    /// @dev Everything about a Window comes off the lens by market id, in-transaction.
    function _resolve(bytes32 marketId) internal view returns (MarketRef memory r) {
        try lens.marketRef(marketId) returns (MarketRef memory got) {
            r = got;
        } catch {
            revert UnknownMarket(marketId);
        }
        if (r.lotBase == 0) revert UnknownMarket(marketId);
    }

    function _requireOutcome(uint8 outcomeIdx) internal pure {
        if (outcomeIdx > 1) revert BadOutcome(outcomeIdx);
    }

    /// @dev One IOC as the reserve, measured (EngineSeam). `priceYesRaw` is the venue's YES price for every kind.
    /// @return cashDelta collateral spent (buy) or received (sell)
    /// @return tokenDelta contracts gained (buy) or sold (sell), raw
    function _placeIoc(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, bool isBuy, uint256 priceYesRaw, uint256 quantityRaw)
        internal
        returns (uint256 cashDelta, uint256 tokenDelta)
    {
        uint8 kind = outcomeIdx == 0 ? (isBuy ? KIND_BUY_YES : KIND_SELL_YES) : (isBuy ? KIND_BUY_NO : KIND_SELL_NO);
        uint40 expireSec = uint40(block.timestamp) + IOC_LIFE_SEC;
        if (expireSec > r.lockAt) expireSec = r.lockAt;
        PlaceArgs memory a = PlaceArgs({
            marketId: marketId,
            kind: kind,
            orderType: ORDER_IOC,
            selfMatch: SELF_CANCEL_TAKER,
            priceTicks: EngineSeam.toTicks(priceYesRaw, r.tickBase),
            lots: EngineSeam.toLots(quantityRaw, r.lotBase),
            expireTs: expireSec,
            maxFills: 16,
            maxEvictions: 4,
            useCredit: false,
            withdrawProceeds: true,
            clientId: 0
        });
        (cashDelta, tokenDelta,) = EngineSeam.placeMeasured(engine, lens, collateral, a, r.lotBase);
    }

    // ------------------------------------------------------------------ the book

    /// @dev The side a taker meets: buying YES takes the asks, buying NO the bids (inverted); selling is the other side.
    ///      `rested` walks only orders past max(Series, params) `minRestSec` (PD-2a); otherwise everything live.
    function _levels(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, bool isExit, bool rested)
        internal
        view
        returns (LevelRaw[] memory levels, bool invert)
    {
        bool isBid = (outcomeIdx == 0) == isExit;
        uint32 rest = 0;
        if (rested) rest = r.minRestSec > params.minRestSec ? r.minRestSec : params.minRestSec;
        levels = lens.levelsRaw(marketId, isBid, LEVELS, rest, MAX_NODES);
        invert = outcomeIdx == 1;
    }

    /// @dev What the book would pay for `quantityRaw` of a side right now: the exit walk, rounded down.
    function _markOver(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 quantityRaw, bool rested)
        internal
        view
        returns (uint256 markRaw, uint256 filledRaw, uint256 limitYesRaw)
    {
        (LevelRaw[] memory levels, bool invert) = _levels(marketId, r, outcomeIdx, true, rested);
        (uint256 cost, uint256 filled, uint256 limit) = LeverageMath.walkQuantity(levels, invert, one, quantityRaw);
        // A ceiling-rounded cost overstates a sale by at most one unit; the mark never rounds in the owner's favour.
        markRaw = cost == 0 ? 0 : cost - 1;
        return (markRaw, filled, limit);
    }

    /// @notice What opening `quantityRaw` of a side at `leverageBps` costs and yields right now, with every refusal
    ///         the open would raise except the opener's own guard, the reserve's caps and the checks that need the fill
    ///         or a signed spot (at-birth health, the fair-value ceiling).
    function previewOpen(bytes32 marketId, uint8 outcomeIdx, uint256 quantityRaw, uint32 leverageBps) external view returns (Preview memory) {
        return _priceEntry(marketId, _resolve(marketId), outcomeIdx, quantityRaw, leverageBps);
    }

    /// @notice The size `stake` affords at `leverageBps` off the live book — exactly what `open` sizes at execution.
    function sizeForStake(bytes32 marketId, uint8 outcomeIdx, uint256 stake, uint32 leverageBps) external view returns (Preview memory) {
        return _sizeEntry(marketId, _resolve(marketId), outcomeIdx, stake, leverageBps);
    }

    function _sizeEntry(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 stake, uint32 leverageBps)
        internal
        view
        returns (Preview memory)
    {
        _requireOutcome(outcomeIdx);
        _requireLeverage(leverageBps);
        (LevelRaw[] memory levels, bool invert) = _levels(marketId, r, outcomeIdx, false, false);
        (, uint256 minQuantity, uint256 lot) = lens.grid(marketId);
        uint256 quantityRaw = LeverageMath.walkBudget(levels, invert, one, LeverageMath.budgetFor(stake, leverageBps, params.premiumBps), lot);
        if (quantityRaw < minQuantity) revert BelowMinQuantity(quantityRaw, minQuantity);
        return _priceEntry(marketId, r, outcomeIdx, quantityRaw, leverageBps);
    }

    function _requireLeverage(uint32 leverageBps) internal view {
        if (leverageBps <= BPS || leverageBps > params.maxLeverageBps) revert BadLeverage(leverageBps, params.maxLeverageBps);
    }

    /// @dev Validates the Window and the size, walks the entry side, derives the terms and refuses what the reserve refuses.
    function _priceEntry(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 quantityRaw, uint32 leverageBps)
        internal
        view
        returns (Preview memory q)
    {
        _requireOutcome(outcomeIdx);
        _requireLeverage(leverageBps);
        Params memory p = params;
        if (r.status != STATUS_TRADING) revert MarketNotTrading(marketId, r.status);
        if (r.lockAt < block.timestamp + p.minTimeLeftSec) revert TooLate(marketId, r.lockAt);
        (, uint256 minQuantity,) = lens.grid(marketId);
        if (quantityRaw < minQuantity) revert BelowMinQuantity(quantityRaw, minQuantity);

        (LevelRaw[] memory levels, bool invert) = _levels(marketId, r, outcomeIdx, false, false);
        (q.costRaw, q.filledRaw, q.limitYesRaw) = LeverageMath.walkQuantity(levels, invert, one, quantityRaw);
        if (q.filledRaw < quantityRaw) revert ThinBook(marketId, q.filledRaw, quantityRaw);
        q.quantityRaw = quantityRaw;
        q.priceRaw = LeverageMath.ceilDiv(q.costRaw * one, quantityRaw);
        if (q.priceRaw < p.minEntryPriceRaw || q.priceRaw > p.maxEntryPriceRaw) revert OutsideBand(q.priceRaw, p.minEntryPriceRaw, p.maxEntryPriceRaw);
        (q.stake, q.fronted, q.premium) = LeverageMath.terms(q.costRaw, leverageBps, p.premiumBps);
        q.winIfRight = LeverageMath.winIfRight(quantityRaw, q.fronted);
        // A boost that could not beat the plain bet even when right is a fee, not a product.
        if (q.winIfRight <= q.stake) revert Underpriced(q.stake, q.winIfRight);
        _requireVoidCovers(q.fronted, quantityRaw);
    }

    /// @dev D-116: a void pays every contract `PAYOUT_VOID / PAYOUT_DENOMINATOR` of a whole one; the front must fit.
    function _requireVoidCovers(uint256 fronted, uint256 quantityRaw) internal pure {
        if (fronted * PAYOUT_DENOMINATOR > quantityRaw * PAYOUT_VOID) revert VoidWouldShort(fronted, quantityRaw);
    }

    /// @dev PD-2b (a ceiling): the side's entry price may sit at most `fairSlackRaw` above the model on a verified spot.
    function _checkEntry(bytes32 marketId, uint8 outcomeIdx, uint256 priceRaw, bytes calldata spotProof) internal {
        uint256 fairRaw = _fairSideRaw(marketId, outcomeIdx, spotProof);
        if (priceRaw > fairRaw + params.fairSlackRaw) revert AboveFairValue(marketId, priceRaw, fairRaw);
    }

    /// @dev The fair-value model's price for one side, per whole contract, on a verified spot.
    function _fairSideRaw(bytes32 marketId, uint8 outcomeIdx, bytes calldata spotProof) internal returns (uint256) {
        (uint256 upE6,) = guard.fairUpE6(marketId, spotProof);
        return FairValue.sideProbE6(upE6, outcomeIdx) * one / FairValue.P_ONE;
    }
}
