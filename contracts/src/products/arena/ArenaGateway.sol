// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/games/ArenaGateway.sol (R4-9, D-227)
// Seam edits (docs/specs/engine.md A.4 shared, as PrivateGateway): the DreamDEX module/pool/ERC-6909 become the engine
// + lens by market id; a pick's buy is an IOC through `EngineSeam.placeMeasured` (the engine's report checked against
// the money, else `EngineAccountingMismatch`) and a card's redemption `redeemPartialMeasured` of exactly its lots;
// sizing walks every live order (`levelsRaw(…, 0)` — the player spends their own stake under their own floor, as the
// private desk's) on `lens.grid`; `TooLate`, the card life and the IOC's expiry use `lockAt` (T08). The venue pin is
// gone (one engine; its collateral and the lens are checked here), and so are the pool approvals and the per-pool
// credit collect — the IOC withdraws its proceeds, and `sweep(bytes32)` collects any engine credit by market id.
// The constructor approves the engine once and opts out of third-party cranks (D-015).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef, LevelRaw} from "../../engine/interfaces/IEngineLens.sol";
import {PlaceArgs, KIND_BUY_YES, KIND_BUY_NO, ORDER_IOC, SELF_CANCEL_TAKER, STATUS_TRADING} from "../../engine/EngineTypes.sol";
import {EngineSeam} from "../shared/EngineSeam.sol";
import {LeverageMath} from "../leverage/LeverageMath.sol";
import {IGameArena} from "./IGameArena.sol";

/// @title The arena's one seam to the engine, and its tunables.
/// @notice A duel pick is a real IOC taker order placed by THIS contract, which then holds the contracts in its own
///         engine position until the Window settles. So the arena is the venue's trader for both players, and what it
///         can attribute to a seat is exactly what moved in that call — collateral out, contracts in — measured before
///         and after. Nothing here is a quote the player was shown.
/// @dev Sizing is stake-first, as the private desk's is: a player swipes a side, not a size, so the per-card cap is
///      walked against the live book at execution and the unspent part goes home.
/// @dev Nothing here stores or emits an engine address (AD-10).
abstract contract ArenaGateway is IGameArena {
    using SafeERC20 for IERC20;

    uint40 internal constant IOC_LIFE_SEC = 60;
    /// @dev Levels read when walking a book; a stake that wants more than these buy gets fewer contracts, never a revert.
    uint64 internal constant LEVELS = 32;
    uint256 internal constant MAX_NODES = 256;
    /// @dev Eight cards is the widest deck a `uint8` completion mask can hold, and the deck policy narrows it further.
    uint8 internal constant MAX_DECK = 8;

    IERC20 public immutable collateral;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    /// @dev One whole unit of collateral (10^decimals); prices are collateral per whole contract.
    uint256 public immutable one;

    address public admin;
    bool public paused;
    Params public params;
    mapping(uint8 tier => Tier) public tierOf;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, Params memory params_) {
        address coll = engine_.collateral();
        if (coll != address(collateral_)) revert WrongCollateral(coll);
        if (lens_.engine() != address(engine_)) revert WrongLens(address(lens_));
        collateral = collateral_;
        engine = engine_;
        lens = lens_;
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

    function setParams(Params calldata next) external onlyAdmin {
        _setParams(next);
    }

    /// @notice Prices one entry tier. A disabled tier refuses new matches; matches already at it are untouched,
    ///         because their pot and cap were frozen at creation.
    function setTier(uint8 tier, Tier calldata next) external onlyAdmin {
        if (next.perCardCapBase == 0) revert BadParams();
        tierOf[tier] = next;
        emit TierSet(tier, next.potBase, next.perCardCapBase, next.enabled);
    }

    /// @notice Pauses new matches, joins and picks. Reveal, settlement, refunds and claims never pause — a paused
    ///         arena must never trap a position or a pot.
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
        if (p.joinWindowSec == 0 || p.revealWindowSec == 0 || p.pickWindowSec == 0) revert BadParams();
        if (p.minDeckSize == 0 || p.maxDeckSize < p.minDeckSize || p.maxDeckSize > MAX_DECK) revert BadParams();
        // A card must outlive the pick window, or the last swipe of a legal deck reverts and the player forfeits a
        // pot for a deadline the parameters themselves made impossible to meet.
        if (p.minCardLifeSec <= p.pickWindowSec) revert BadParams();
        params = p;
        emit ParamsUpdated(p);
    }

    /// @notice Moves the arena's own engine credit in `marketId` into its wallet. Anyone may call; the credit is the
    ///         arena's either way (an IOC with `withdrawProceeds` never leaves it one).
    function sweep(bytes32 marketId) external returns (uint256 amount) {
        amount = EngineSeam.collectCreditMeasured(engine, lens, collateral, marketId);
        if (amount != 0) emit Swept(amount);
    }

    // ------------------------------------------------------------------ the venue

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

    /// @dev Places one measured IOC buy as the arena. `priceYesRaw` is the venue's YES price for every kind.
    /// @return cashDelta collateral spent
    /// @return tokenDelta contracts gained, raw
    function _buyIoc(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 priceYesRaw, uint256 quantityRaw)
        internal
        returns (uint256 cashDelta, uint256 tokenDelta)
    {
        uint40 expireSec = uint40(block.timestamp) + IOC_LIFE_SEC;
        if (expireSec > r.lockAt) expireSec = r.lockAt;
        PlaceArgs memory a = PlaceArgs({
            marketId: marketId,
            kind: outcomeIdx == 0 ? KIND_BUY_YES : KIND_BUY_NO,
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

    /// @dev Redeems exactly `quantityRaw` of one outcome and reports the collateral that came back. A losing side
    ///      returns nothing and a voided Window half — both real answers, measured by the seam.
    function _redeem(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 quantityRaw) internal returns (uint256 payout) {
        return EngineSeam.redeemPartialMeasured(engine, lens, collateral, marketId, outcomeIdx, EngineSeam.toLots(quantityRaw, r.lotBase));
    }

    function _isSettled(bytes32 marketId) internal view returns (bool) {
        return lens.isResolved(marketId) || lens.isVoided(marketId);
    }

    /// @dev Fills and payouts sit far below 2^128 under any tier the arena will ever price — but a silent truncation
    ///      would erase a position a player paid real money for, so the cast is checked.
    function _u128(uint256 v) internal pure returns (uint128) {
        if (v > type(uint128).max) revert Overflow(v);
        return uint128(v);
    }

    // ------------------------------------------------------------------ the book

    /// @notice What `stake` buys on one side of a card right now, and exactly what the pick will size at execution.
    ///         The readiness screen quotes this; nothing is promised by it.
    function sizeForStake(bytes32 marketId, uint8 outcomeIdx, uint256 stake) external view returns (Quote memory) {
        return _sizeEntry(marketId, _resolve(marketId), outcomeIdx, stake);
    }

    /// @dev Validates the Window, walks the entry side for what the stake buys, then caps the size so the venue's
    ///      escrow at the walk's limit never exceeds the stake — one seat's card never borrows another's pot, even
    ///      for a block (the vault's rule).
    function _sizeEntry(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 stake) internal view returns (Quote memory q) {
        _requireOutcome(outcomeIdx);
        if (stake == 0) revert ZeroAmount();
        if (r.status != STATUS_TRADING) revert MarketNotTrading(marketId, r.status);
        if (r.lockAt < block.timestamp + params.minCardLifeSec) revert TooLate(marketId, r.lockAt);
        bool invert = outcomeIdx == 1;
        LevelRaw[] memory levels = lens.levelsRaw(marketId, invert, LEVELS, 0, MAX_NODES);
        (, uint256 minQuantity, uint256 lot) = lens.grid(marketId);
        uint256 quantityRaw = LeverageMath.walkBudget(levels, invert, one, stake, lot);
        (uint256 cost, uint256 filled, uint256 limitYes) = LeverageMath.walkQuantity(levels, invert, one, quantityRaw);
        uint256 limitSide = LeverageMath.sidePrice(limitYes, invert, one);
        if (limitSide != 0 && quantityRaw * limitSide > stake * one) {
            quantityRaw = stake * one / limitSide;
            if (lot > 1) quantityRaw = (quantityRaw / lot) * lot;
            (cost, filled, limitYes) = LeverageMath.walkQuantity(levels, invert, one, quantityRaw);
        }
        if (quantityRaw < minQuantity || filled < quantityRaw) revert BelowMinQuantity(filled, minQuantity);
        q.quantityRaw = quantityRaw;
        q.costRaw = cost;
        q.limitYesRaw = limitYes;
        q.priceRaw = LeverageMath.ceilDiv(cost * one, quantityRaw);
    }
}
