// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/private/PrivateGateway.sol
// Seam edits (docs/specs/engine.md A.4.4, A.4 shared): the DreamDEX module/pool/ERC-6909 become the engine + lens by
// market id; a slot's buy is an IOC through `EngineSeam.placeMeasured` (the engine's report checked against the money,
// Agari D-117 "PlaceResult checked against custody") and its settlement `redeemPartialMeasured` of exactly its lots;
// sizing walks every live order (`levelsRaw(…, 0)`: the desk spends the owner's own stake under the owner's own
// guard, so PD-2's rested-only rule, which protects a reserve's capital, does not apply — D-117) on `lens.grid`;
// `TooLate` and the IOC's expiry use `lockAt` (T08). The constructor checks the engine's collateral and the lens,
// approves the engine once and opts out of third-party cranks (D-015). The desk key is pinned here: the EIP-712 claim
// the desk signs (domain: chain id + this contract) verifies against `desk()` off chain (PD-4).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef, LevelRaw} from "../../engine/interfaces/IEngineLens.sol";
import {PlaceArgs, KIND_BUY_YES, KIND_BUY_NO, ORDER_IOC, SELF_CANCEL_TAKER, STATUS_TRADING} from "../../engine/EngineTypes.sol";
import {EngineSeam} from "../shared/EngineSeam.sol";
import {LeverageMath} from "../leverage/LeverageMath.sol";
import {IPrivateDesk} from "./IPrivateDesk.sol";

/// @title The private desk's one seam to the engine, and its tunables.
/// @notice Every slot's position is bought as an IOC taker by THIS contract, so the venue sees one taker for every
///         private bet ever placed here — the slot is the desk's own storage, never a venue account. Every figure
///         booked is a measured delta of the desk's own cash and engine position around the call.
/// @dev Nothing here stores or emits an engine address (AD-10).
abstract contract PrivateGateway is IPrivateDesk {
    using SafeERC20 for IERC20;

    uint40 internal constant IOC_LIFE_SEC = 60;
    /// @dev Levels read when walking a book; a stake that wants more than these buy gets fewer contracts, never a revert.
    uint64 internal constant LEVELS = 32;
    uint256 internal constant MAX_NODES = 256;

    IERC20 public immutable collateral;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    /// @dev One whole unit of collateral (10^decimals); prices are collateral per whole contract.
    uint256 public immutable one;

    address public admin;
    /// @dev The one key that moves money between the pool and the slots, and signs the claims. Pinned here so a claim
    ///      can be verified against the chain, not against the desk's word.
    address public desk;
    bool public paused;
    Params public params;

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_, address desk_, Params memory params_) {
        if (desk_ == address(0)) revert ZeroAddress();
        address coll = engine_.collateral();
        if (coll != address(collateral_)) revert WrongCollateral(coll);
        if (lens_.engine() != address(engine_)) revert WrongLens(address(lens_));
        collateral = collateral_;
        engine = engine_;
        lens = lens_;
        one = 10 ** IERC20Metadata(address(collateral_)).decimals();
        admin = msg.sender;
        desk = desk_;
        _setParams(params_);
        collateral_.forceApprove(address(engine_), type(uint256).max);
        engine_.setCrankOptOut(true);
    }

    // ------------------------------------------------------------------ admin

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    modifier onlyDesk() {
        if (msg.sender != desk) revert NotDesk(msg.sender);
        _;
    }

    /// @notice Rotates the desk key. Claims signed by the old key stop verifying against the chain — cash them out first.
    function setDesk(address next) external onlyAdmin {
        if (next == address(0)) revert ZeroAddress();
        desk = next;
        emit DeskChanged(next);
    }

    function setParams(Params calldata next) external onlyAdmin {
        _setParams(next);
    }

    /// @notice Pauses new charges and new mints. Settlement, sweeps, credits and withdrawals never pause.
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
        if (p.minStake == 0 || p.maxStake < p.minStake || p.minTimeLeftSec == 0) revert BadParams();
        params = p;
        emit ParamsUpdated(p);
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

    /// @dev Places one measured IOC buy as the desk. `priceYesRaw` is the venue's YES price for every kind.
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

    // ------------------------------------------------------------------ the book

    /// @notice The size `stake` affords on a side off the live book right now — the stake-first quote, and exactly what
    ///         the mint will size at execution — then that size priced.
    function sizeForStake(bytes32 marketId, uint8 outcomeIdx, uint256 stake) external view returns (Preview memory) {
        return _sizeEntry(marketId, _resolve(marketId), outcomeIdx, stake);
    }

    /// @dev Validates the Window and the stake, walks the entry side (every live order) for what the stake buys, then
    ///      caps the size so the worst case at the walk's limit never exceeds the stake — the slot's own money covers
    ///      it, nobody else's is borrowed even for a block (the vault's rule).
    function _sizeEntry(bytes32 marketId, MarketRef memory r, uint8 outcomeIdx, uint256 stake) internal view returns (Preview memory q) {
        if (outcomeIdx > 1) revert BadOutcome(outcomeIdx);
        Params memory p = params;
        if (stake < p.minStake || stake > p.maxStake) revert StakeOutsideBand(stake, p.minStake, p.maxStake);
        if (r.status != STATUS_TRADING) revert MarketNotTrading(marketId, r.status);
        if (r.lockAt < block.timestamp + p.minTimeLeftSec) revert TooLate(marketId, r.lockAt);
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
