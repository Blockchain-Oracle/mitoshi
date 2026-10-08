// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/parlay/ParlayPricing.sol
// Seam edits (docs/specs/engine.md A.4.6, A.4 shared): the DreamDEX module/market/pool → the engine's lens by market id
// (`_resolve` = `lens.marketRef`, an unknown id → `UnknownMarket`; status, `lockAt` for the trading-time check,
// `expiry` for settlement, T08); the collateral is checked once against `engine.collateral()` in the constructor
// (A.2.7), which also opts out of third-party cranks (D-015); `_bookPrice` walks `lens.levelsRaw` over orders rested
// at least max(Series, params) `minRestSec` (D-109); `_checkFair` refuses a leg priced more than `fairSlackRaw` below
// the FairValueGuard's model on a same-call signed spot (PD-2, `BelowFairValue`). Previews stay `view` without a proof.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef, LevelRaw} from "../../engine/interfaces/IEngineLens.sol";
import {STATUS_TRADING} from "../../engine/EngineTypes.sol";
import {FairValue} from "../../fair/FairValue.sol";
import {FairValueGuard} from "../../fair/FairValueGuard.sol";
import {IParlayReserve} from "./IParlayReserve.sol";
import {ParlayMath} from "./ParlayMath.sol";

/// @title The reserve's one seam to the engine, and its tunables.
/// @notice A leg's price is the venue's own book, read inside the transaction: the cost-weighted
///         price of the rested depth the ticket would need to hedge, on the side the opener chose. The
///         reference (`parlay624.move`) took opener-supplied probabilities and named that its
///         known gap; here nothing but the resting book can price a leg, and the oracle's fair value bounds it.
/// @dev Nothing here stores anything but market ids (AD-10); the engine address is the venue pin.
abstract contract ParlayPricing is IParlayReserve {
    /// @dev Levels read per side when pricing a leg; a book thinner than the depth over these refuses the leg.
    uint64 internal constant PRICE_LEVELS = 32;
    /// @dev Nodes a level walk may visit (the lens filters dead, expired and unrested orders node by node).
    uint256 internal constant MAX_NODES = 256;

    IERC20 public immutable collateral;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    FairValueGuard public immutable guard;
    /// @dev One whole unit of collateral (10^decimals): the scale of every price and probability here.
    uint256 public immutable one;

    address public admin;
    bool public paused;
    Params public params;

    /// @dev Everything `openParlay` decides before it moves money.
    struct Priced {
        uint256 stake;
        uint256 combinedProbRaw;
        uint64 lastExpirySec;
        uint256[] pricesRaw;
        uint64[] expiries;
    }

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
        // D-015: the reserve never holds engine positions, but no third party may ever redeem into it unattributed.
        engine_.setCrankOptOut(true);
    }

    // ------------------------------------------------------------------ admin

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    /// @notice Tunables only. Open tickets keep the terms they were opened on.
    function setParams(Params calldata next) external onlyAdmin {
        _setParams(next);
    }

    /// @notice Pauses new tickets and new supply. Settlement, claims, refunds and withdrawals never pause.
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
        if (p.maxExposureBps > ParlayMath.BPS || p.correlationBps > ParlayMath.BPS || p.maxLegs < 2) revert BadParams();
        if (p.maxPayoutCap == 0 || p.maxExpiryLocked == 0 || p.priceDepthRaw == 0) revert BadParams();
        if (p.fairSlackRaw > one) revert BadParams();
        params = p;
        emit ParamsUpdated(p);
    }

    // ------------------------------------------------------------------ pricing

    /// @notice What a ticket would cost right now, with every refusal the open would raise except the
    ///         opener's own `maxStake` guard, the reserve's caps and the fair-value bound (it needs a signed
    ///         spot) — so a client can ask the chain for the exact answer before signing.
    function previewOpen(LegInput[] calldata legs, uint256 maxPayout)
        external
        view
        returns (uint256 stake, uint256 combinedProbRaw, uint256[] memory pricesRaw, uint64[] memory expiries)
    {
        Priced memory q = _price(legs, maxPayout);
        return (q.stake, q.combinedProbRaw, q.pricesRaw, q.expiries);
    }

    /// @notice One side's price for `quantityRaw` contracts, exactly as a leg would be priced.
    function previewLegPrice(bytes32 marketId, uint8 outcomeIdx, uint256 quantityRaw) external view returns (uint256 priceRaw, uint256 filledRaw) {
        if (outcomeIdx > 1) revert BadOutcome(outcomeIdx);
        MarketRef memory r = _resolve(marketId);
        return _bookPrice(marketId, r.minRestSec, outcomeIdx, quantityRaw);
    }

    /// @dev Validates every leg against the venue, prices each off its book, combines and floors the stake.
    function _price(LegInput[] calldata legs, uint256 maxPayout) internal view returns (Priced memory q) {
        uint256 n = legs.length;
        if (n < 2 || n > params.maxLegs) revert BadLegCount(n);
        if (maxPayout == 0 || maxPayout > params.maxPayoutCap) revert OverPayoutCap(maxPayout, params.maxPayoutCap);
        uint256 depth = maxPayout > params.priceDepthRaw ? maxPayout : params.priceDepthRaw;

        q.pricesRaw = new uint256[](n);
        q.expiries = new uint64[](n);
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = legs[i].marketId;
            uint8 outcomeIdx = legs[i].outcomeIdx;
            if (outcomeIdx > 1) revert BadOutcome(outcomeIdx);
            for (uint256 j = 0; j < i; j++) {
                if (legs[j].marketId == id) revert DuplicateMarket(id);
            }
            MarketRef memory r = _resolve(id);
            if (r.status != STATUS_TRADING) revert MarketNotTrading(id, r.status);
            // A leg whose Window has already stopped trading would let the opener pick a known outcome.
            if (r.lockAt <= block.timestamp) revert LegExpired(id, r.lockAt);
            (uint256 priceRaw, uint256 filled) = _bookPrice(id, r.minRestSec, outcomeIdx, depth);
            if (filled < depth) revert ThinBook(id, filled, depth);
            q.pricesRaw[i] = priceRaw;
            q.expiries[i] = r.expiry;
            if (r.expiry > q.lastExpirySec) q.lastExpirySec = r.expiry;
        }

        q.combinedProbRaw = ParlayMath.combine(q.pricesRaw, q.expiries, one, params.correlationBps);
        if (q.combinedProbRaw < params.minCombinedProbRaw) revert LongShot(q.combinedProbRaw, params.minCombinedProbRaw);
        q.stake = ParlayMath.floorStake(maxPayout, q.combinedProbRaw, one, params.marginBps);
        // The house must front something, or the ticket is not a parlay.
        if (q.stake >= maxPayout) revert Underpriced(q.stake, maxPayout);
    }

    /// @dev PD-2 (one-sided floor): each leg's book price, plus the slack, must reach the fair-value model's
    ///      probability for that side on a verified spot — a book that underprices a leg would underprice the ticket.
    function _checkFair(LegInput[] calldata legs, uint256[] memory pricesRaw, bytes[] calldata spotProofs) internal {
        if (spotProofs.length != legs.length) revert BadProofCount(spotProofs.length, legs.length);
        for (uint256 i = 0; i < legs.length; i++) {
            (uint256 upE6,) = guard.fairUpE6(legs[i].marketId, spotProofs[i]);
            uint256 fairRaw = FairValue.sideProbE6(upE6, legs[i].outcomeIdx) * one / FairValue.P_ONE;
            if (pricesRaw[i] + params.fairSlackRaw < fairRaw) revert BelowFairValue(legs[i].marketId, pricesRaw[i], fairRaw);
        }
    }

    /// @dev UP buys the YES asks as they rest; DOWN buys NO, which is the YES bids inverted. Rested depth only (D-109).
    function _bookPrice(bytes32 marketId, uint32 seriesRestSec, uint8 outcomeIdx, uint256 quantityRaw)
        internal
        view
        returns (uint256 priceRaw, uint256 filledRaw)
    {
        bool isBid = outcomeIdx == 1;
        uint32 rest = seriesRestSec > params.minRestSec ? seriesRestSec : params.minRestSec;
        LevelRaw[] memory levels = lens.levelsRaw(marketId, isBid, PRICE_LEVELS, rest, MAX_NODES);
        return ParlayMath.vwap(levels, isBid, one, quantityRaw);
    }

    /// @dev Everything about a Window comes off the lens by market id, in-transaction.
    function _resolve(bytes32 marketId) internal view returns (MarketRef memory r) {
        try lens.marketRef(marketId) returns (MarketRef memory got) {
            r = got;
        } catch {
            revert UnknownMarket(marketId);
        }
        if (r.lotBase == 0) revert UnknownMarket(marketId);
    }
}
