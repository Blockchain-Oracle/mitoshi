// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Ported from Masayume 68f7a09:contracts/src/maker/MakerGateway.sol
// Seam edits (docs/specs/engine.md A.4.2, A.4 shared): DreamDEX module/pool/ERC-6909 → the engine + lens through
// `EngineSeam`; `MarketRef {marketId, lockAt, expiry, lotBase, tickBase, status}`; `_rest` is a PostOnly buy with
// `useCredit = false, withdrawProceeds = false` whose escrow is the measured wallet delta, asserted equal to the
// engine's `transferredIn` and to `lots·ownTicks·cu` with `restedLots == lots` (D-017 — the engine never refunds
// lazily into a placement, so Masayume's "exact figure, refund booked apart" split is gone); `_collect` withdraws the
// vault's engine credit (evictions, cancels, third-party sweeps) measured; `_pullAll = cancelAll(m, 16, false)`;
// `_merge = mergeSet` (Trading only); `_redeemAll` is one full `redeem` (T05 drains the vault's own orders first). The
// constructor pins the collateral and the lens, approves the engine once and opts out of third-party cranks (D-015);
// no `setOperator` (positions are internal).

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, MarketRef as LensRef, PositionView} from "../../engine/interfaces/IEngineLens.sol";
import {
    PlaceArgs,
    PlaceResult,
    KIND_BUY_YES,
    KIND_BUY_NO,
    ORDER_POST_ONLY,
    SELF_CANCEL_TAKER,
    PAIR_TICKS,
    STATUS_RESOLVED,
    STATUS_VOIDED
} from "../../engine/EngineTypes.sol";
import {EngineSeam} from "../shared/EngineSeam.sol";
import {IMarketMakerVault} from "./IMarketMakerVault.sol";

/// @title The maker vault's one seam to the engine.
/// @notice The vault is the venue's maker: it rests post-only bids as itself and holds the outcome
///         lots the fills leave behind. Every figure it books is measured around the engine call and
///         checked against the engine's own report, and any credit the engine leaves the vault is
///         pulled back into the wallet — and booked — in the same call.
/// @dev Nothing here stores or emits anything but the market id (AD-10); the engine address is the venue pin.
abstract contract MakerGateway is IMarketMakerVault {
    using SafeERC20 for IERC20;

    uint8 internal constant BUY_YES = KIND_BUY_YES;
    uint8 internal constant BUY_NO = KIND_BUY_NO;
    uint64 internal constant NS = 1e9;
    /// @dev A PostOnly order never fills; the engine still wants a fill budget of at least one.
    uint8 internal constant MAX_FILLS = 1;
    /// @dev Expired orders the cross walk may evict on the way (the vault's own included, E-35).
    uint8 internal constant MAX_EVICTIONS = 4;
    /// @dev The engine holds at most 16 open orders per holder per market, so one `cancelAll` clears them all.
    uint8 internal constant CANCEL_MAX = 16;

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
        // D-015: a third-party `redeemFor` would pay the vault outside `settle`, unbooked; `settle` is the crank.
        engine_.setCrankOptOut(true);
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

    /// @dev The engine's cash unit: `1000 × cu == lotBase` on every registered grid (E-01).
    function _cu(MarketRef memory ref) internal pure returns (uint64) {
        return ref.lotBase / uint64(PAIR_TICKS);
    }

    /// @dev Moves the vault's engine credit in the Window into its wallet, measured. The caller books it.
    function _collect(MarketRef memory ref) internal returns (uint256 amount) {
        amount = EngineSeam.collectCreditMeasured(engine, lens, collateral, ref.marketId);
        if (amount != 0) emit Swept(amount);
    }

    /// @dev Rests one post-only buy as the vault and reports the escrow that left its wallet for it. The venue's
    ///      price is always the YES price: a BUY_NO at `p` rests as a YES ask at `p` and escrows `one − p` a
    ///      contract. The escrow is the measured delta, asserted equal to the engine's report (D-017).
    function _rest(MarketRef memory ref, uint8 kind, uint256 priceRaw, uint256 quantityRaw, uint64 expireNs)
        internal
        returns (uint256 escrow, uint128 orderId)
    {
        PlaceArgs memory a = PlaceArgs({
            marketId: ref.marketId,
            kind: kind,
            orderType: ORDER_POST_ONLY,
            selfMatch: SELF_CANCEL_TAKER,
            priceTicks: EngineSeam.toTicks(priceRaw, ref.tickBase),
            lots: EngineSeam.toLots(quantityRaw, ref.lotBase),
            expireTs: EngineSeam.expireSec(expireNs, ref.lockAt),
            maxFills: MAX_FILLS,
            maxEvictions: MAX_EVICTIONS,
            useCredit: false,
            withdrawProceeds: false,
            clientId: 0
        });
        PlaceResult memory r;
        (escrow, r) = EngineSeam.restMeasured(engine, lens, collateral, a, _cu(ref));
        if (r.restedOrderId == 0) revert OrderNotRested(ref.marketId);
        orderId = r.restedOrderId;
    }

    /// @dev Cancels every order the vault has resting on the Window — live or expired, in any status — through
    ///      its per-holder list. The escrow comes back as engine credit; the caller collects and books it.
    function _pullAll(MarketRef memory ref) internal returns (uint256 orders) {
        if (lens.positionOf(ref.marketId, address(this)).openOrders == 0) return 0;
        (orders,) = engine.cancelAll(ref.marketId, CANCEL_MAX, false);
    }

    /// @dev Burns `pairs` complete sets through the engine (Trading only) and reports the collateral that came back.
    function _merge(MarketRef memory ref, uint256 pairs) internal returns (uint256 back) {
        back = EngineSeam.mergeMeasured(engine, lens, collateral, ref.marketId, EngineSeam.toLots(pairs, ref.lotBase), _cu(ref));
    }

    /// @dev One full redeem of whatever the vault still holds on a terminal Window.
    function _redeemAll(MarketRef memory ref) internal returns (uint256 payout) {
        payout = EngineSeam.redeemAllMeasured(engine, lens, collateral, ref.marketId);
    }

    function _isSettled(MarketRef memory ref) internal pure returns (bool) {
        return ref.status == STATUS_RESOLVED || ref.status == STATUS_VOIDED;
    }

    /// @dev What the vault holds on each side, raw units (free lots × lotBase; a maker that only buys locks none).
    function _held(MarketRef memory ref) internal view returns (uint256 yes, uint256 no) {
        PositionView memory p = lens.positionOf(ref.marketId, address(this));
        yes = uint256(p.yesFree) * ref.lotBase;
        no = uint256(p.noFree) * ref.lotBase;
    }
}
