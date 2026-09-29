// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/vault/VenueGateway.sol
// Seam edits (docs/specs/engine.md A.4.1, A.4 shared): DreamDEX module/pool/ERC-6909 → the engine + lens through
// `EngineSeam`; `MarketRef {marketId, lockAt, expiry, lotBase, tickBase}` (+ the status read in the same lens call);
// `outcomeId(m, idx)` replaces the ERC-6909 ids; `_cash(m)` = wallet + engine credit; `_placeIoc` keeps the external
// `expireNs` and converts at the seam through `placeMeasured`; constructor checks the collateral and lens, approves the
// engine once and opts out of third-party cranks (D-015); `sweep(bytes32)` replaces `sweep(address pool)`.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef as LensRef} from "../../engine/interfaces/IEngineLens.sol";
import {PlaceArgs, ORDER_IOC, SELF_CANCEL_TAKER, STATUS_TRADING, STATUS_RESOLVED, STATUS_VOIDED} from "../../engine/EngineTypes.sol";
import {EngineSeam} from "../shared/EngineSeam.sol";
import {IEventVault} from "./IEventVault.sol";

/// @title The vault's one seam to the engine.
/// @notice The vault is the venue's trader: it places IOC orders as itself and holds the outcome
///         positions, so what it can attribute to an owner is exactly what moved in that call —
///         collateral in or out, outcome lots in or out — measured before and after and checked
///         against the engine's own `PlaceResult`.
/// @dev Nothing here stores or emits anything but the market id (AD-10); the engine address is the venue pin.
abstract contract VenueGateway is IEventVault {
    using SafeERC20 for IERC20;

    /// @dev A.4.1: the vault's IOC budgets (the engine caps them by the Series' own caps).
    uint8 internal constant MAX_FILLS = 16;
    uint8 internal constant MAX_EVICTIONS = 4;

    IERC20 public immutable collateral;
    IEventsEngine public immutable engine;
    IEngineLens public immutable lens;
    /// @dev One whole unit of collateral (10^decimals); prices are collateral per whole outcome token.
    uint256 public immutable one;

    struct MarketRef {
        bytes32 marketId;
        uint40 lockAt;
        uint40 expiry;
        uint64 lotBase;
        uint64 tickBase;
        uint8 status;
    }

    constructor(IERC20 collateral_, IEventsEngine engine_, IEngineLens lens_) {
        address coll = engine_.collateral();
        if (coll != address(collateral_)) revert WrongCollateral(coll);
        if (lens_.engine() != address(engine_)) revert WrongLens(address(lens_));
        collateral = collateral_;
        engine = engine_;
        lens = lens_;
        one = 10 ** IERC20Metadata(address(collateral_)).decimals();
        collateral_.forceApprove(address(engine_), type(uint256).max);
        // D-015: a third-party `redeemFor` would dump pooled payouts into the vault unattributed; `crankSettle` is the crank.
        engine_.setCrankOptOut(true);
    }

    /// @notice Moves the vault's own engine credit in `marketId` into its wallet. Anyone may call;
    ///         the credit is the vault's either way, so nothing changes hands.
    function sweep(bytes32 marketId) external returns (uint256 amount) {
        amount = lens.creditOf(marketId, address(this));
        if (amount == 0) return 0;
        engine.withdrawCredit(marketId, uint64(amount));
        emit Swept(amount);
    }

    /// @notice The vault's id for one side of a Window: `keccak256(abi.encode(marketId, outcomeIdx))`.
    function outcomeId(bytes32 marketId, uint8 outcomeIdx) public pure returns (uint256) {
        if (outcomeIdx > 1) revert BadOutcome(outcomeIdx);
        return uint256(keccak256(abi.encode(marketId, outcomeIdx)));
    }

    /// @dev Everything about a Window comes off the lens by market id, in-transaction.
    function _resolve(bytes32 marketId) internal view returns (MarketRef memory ref) {
        LensRef memory r;
        try lens.marketRef(marketId) returns (LensRef memory got) {
            r = got;
        } catch {
            revert UnknownMarket(marketId);
        }
        if (r.lotBase == 0) revert UnknownMarket(marketId);
        ref = MarketRef(marketId, r.lockAt, r.expiry, r.lotBase, r.tickBase, r.status);
    }

    /// @dev Collateral the vault can spend in `marketId`: its wallet balance plus its engine credit there.
    function _cash(bytes32 marketId) internal view returns (uint256) {
        return EngineSeam.cash(collateral, lens, marketId);
    }

    /// @dev Places one IOC order as the vault and reports what actually moved.
    /// @return cashDelta collateral spent (buy) or received (sell)
    /// @return tokenDelta outcome raw units gained (buy) or sold (sell)
    function _placeIoc(
        MarketRef memory ref,
        uint8 outcomeIdx,
        bool isBuy,
        uint256 priceRaw,
        uint256 quantityRaw,
        uint64 expireNs,
        uint256 grantId
    ) internal returns (uint256 cashDelta, uint256 tokenDelta) {
        if (ref.status != STATUS_TRADING) revert MarketNotTrading(ref.status);
        if (outcomeIdx > 1) revert BadOutcome(outcomeIdx);
        PlaceArgs memory a = PlaceArgs({
            marketId: ref.marketId,
            kind: _kind(outcomeIdx, isBuy),
            orderType: ORDER_IOC,
            selfMatch: SELF_CANCEL_TAKER,
            priceTicks: EngineSeam.toTicks(priceRaw, ref.tickBase),
            lots: EngineSeam.toLots(quantityRaw, ref.lotBase),
            expireTs: EngineSeam.expireSec(expireNs, ref.lockAt),
            maxFills: MAX_FILLS,
            maxEvictions: MAX_EVICTIONS,
            useCredit: false,
            withdrawProceeds: true,
            clientId: uint64(grantId)
        });
        (cashDelta, tokenDelta,) = EngineSeam.placeMeasured(engine, lens, collateral, a, ref.lotBase);
    }

    /// @dev BUY_YES 0, SELL_YES 1, BUY_NO 2, SELL_NO 3 — the engine's kind numbering.
    function _kind(uint8 outcomeIdx, bool isBuy) internal pure returns (uint8) {
        return (outcomeIdx * 2) + (isBuy ? 0 : 1);
    }

    /// @dev The order's price in the bought side's own terms: the book quotes YES; NO costs the rest.
    function _sidePrice(uint8 outcomeIdx, uint256 priceRaw) internal view returns (uint256) {
        return outcomeIdx == 0 ? priceRaw : one - priceRaw;
    }

    /// @dev Redeems `amount` of one outcome through the engine and reports the collateral that came back.
    function _redeem(MarketRef memory ref, uint8 outcomeIdx, uint256 amount) internal returns (uint256 payout) {
        uint64 lots = EngineSeam.toLots(amount, ref.lotBase);
        payout = EngineSeam.redeemPartialMeasured(engine, lens, collateral, ref.marketId, outcomeIdx, lots);
    }

    function _isSettled(MarketRef memory ref) internal pure returns (bool) {
        return ref.status == STATUS_RESOLVED || ref.status == STATUS_VOIDED;
    }
}
