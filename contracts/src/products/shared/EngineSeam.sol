// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEventsEngine} from "../../engine/interfaces/IEventsEngine.sol";
import {IEngineLens, PositionView, MarketRef as LensRef} from "../../engine/interfaces/IEngineLens.sol";
import {PlaceArgs, PlaceResult, KIND_BUY_YES, KIND_BUY_NO, ORDER_POST_ONLY, PAIR_TICKS} from "../../engine/EngineTypes.sol";

/// @title The one seam every product uses to trade on the engine (App. A.2.8, D-012 — no façade contract).
/// @notice Products keep Masayume's raw DreamDEX units (A.2.7: quantity = lots × lotBase, price = ticks × tickBase,
///         expiries in ns) and convert here, exactly or not at all (`OffGrid`). Every placement and redemption is
///         measured: the product's wallet and engine position before and after must agree with what the engine
///         reports, else `EngineAccountingMismatch` (Agari's product assert, extended to every product).
/// @dev Internal library: inlined into each product, so the engine sees the product itself as `msg.sender`.
library EngineSeam {
    uint256 internal constant NS_PER_SEC = 1e9;

    error OffGrid(uint256 raw, uint64 base);
    error EngineAccountingMismatch();

    /// @notice The lens's market reference (A.2.7 `markets(id)`); an unknown market reverts by the lens's name.
    function resolve(IEngineLens lens, bytes32 m) internal view returns (LensRef memory) {
        return lens.marketRef(m);
    }

    /// @notice `priceRaw / tickBase`, exact (A.2.7); the engine itself refuses ticks outside 1..999.
    function toTicks(uint256 priceRaw, uint64 tickBase) internal pure returns (uint16) {
        if (tickBase == 0 || priceRaw % tickBase != 0 || priceRaw / tickBase > type(uint16).max) revert OffGrid(priceRaw, tickBase);
        return uint16(priceRaw / tickBase);
    }

    /// @notice `quantityRaw / lotBase`, exact (A.2.7).
    function toLots(uint256 quantityRaw, uint64 lotBase) internal pure returns (uint64) {
        if (lotBase == 0 || quantityRaw % lotBase != 0 || quantityRaw / lotBase > type(uint64).max) revert OffGrid(quantityRaw, lotBase);
        return uint64(quantityRaw / lotBase);
    }

    /// @notice DreamDEX `expireNs` → engine seconds, clamped to `lockAt` (D-013, T08: `lockAt` bounds order expiry).
    function expireSec(uint64 expireNs, uint40 lockAt) internal pure returns (uint40) {
        uint256 sec = uint256(expireNs) / NS_PER_SEC;
        return sec < lockAt ? uint40(sec) : lockAt;
    }

    /// @notice What the product can spend in market `m`: its wallet plus its engine credit there.
    function cash(IERC20 collateral, IEngineLens lens, bytes32 m) internal view returns (uint256) {
        return collateral.balanceOf(address(this)) + lens.creditOf(m, address(this));
    }

    /// @notice Places a taker order that must not rest (IOC/FOK, `useCredit = false`, `withdrawProceeds = true`) and
    ///         proves it against the balances (A.4 shared): buy — `Δwallet == transferredIn == cashSpent`,
    ///         `withdrawn == 0`, `Δfree == filledLots`; sell mirrored; nothing rested, credit and escrow unchanged.
    /// @return cashDelta collateral spent (buy) or received (sell), raw base units
    /// @return tokenDelta outcome gained (buy) or sold (sell), raw units (`filledLots × lotBase`)
    function placeMeasured(IEventsEngine engine, IEngineLens lens, IERC20 collateral, PlaceArgs memory a, uint64 lotBase)
        internal
        returns (uint256 cashDelta, uint256 tokenDelta, PlaceResult memory r)
    {
        bool isBuy = a.kind == KIND_BUY_YES || a.kind == KIND_BUY_NO;
        bool yes = a.kind < KIND_BUY_NO;
        uint256 w0 = collateral.balanceOf(address(this));
        PositionView memory p0 = lens.positionOf(a.marketId, address(this));
        r = engine.placeOrder(a);
        uint256 w1 = collateral.balanceOf(address(this));
        PositionView memory p1 = lens.positionOf(a.marketId, address(this));

        uint256 f0 = yes ? p0.yesFree : p0.noFree;
        uint256 f1 = yes ? p1.yesFree : p1.noFree;
        bool ok = r.restedLots == 0 && p1.credit == p0.credit && p1.lockedCash == p0.lockedCash;
        if (isBuy) {
            ok = ok && w0 >= w1 && w0 - w1 == r.transferredIn && r.transferredIn == r.cashSpent && r.withdrawn == 0
                && r.cashReceived == 0 && f1 >= f0 && f1 - f0 == r.filledLots;
            cashDelta = r.cashSpent;
        } else {
            ok = ok && w1 >= w0 && w1 - w0 == r.withdrawn && r.withdrawn == r.cashReceived && r.transferredIn == 0
                && r.cashSpent == 0 && f0 >= f1 && f0 - f1 == r.filledLots;
            cashDelta = r.cashReceived;
        }
        if (!ok) revert EngineAccountingMismatch();
        tokenDelta = uint256(r.filledLots) * lotBase;
    }

    /// @notice Redeems `lots` of one outcome from the product's free balance and proves the payout landed in its
    ///         wallet (`Δwallet == payout`, `Δfree == lots`, credit unchanged).
    function redeemPartialMeasured(IEventsEngine engine, IEngineLens lens, IERC20 collateral, bytes32 m, uint8 outcome, uint64 lots)
        internal
        returns (uint256 payout)
    {
        uint256 w0 = collateral.balanceOf(address(this));
        PositionView memory p0 = lens.positionOf(m, address(this));
        payout = engine.redeemPartial(m, outcome, lots);
        uint256 w1 = collateral.balanceOf(address(this));
        PositionView memory p1 = lens.positionOf(m, address(this));
        uint256 f0 = outcome == 0 ? p0.yesFree : p0.noFree;
        uint256 f1 = outcome == 0 ? p1.yesFree : p1.noFree;
        if (!(w1 >= w0 && w1 - w0 == payout && f0 >= f1 && f0 - f1 == lots && p1.credit == p0.credit)) {
            revert EngineAccountingMismatch();
        }
    }
    // ------------------------------------------------------------------------------------------ makers (A.4.2, S8)

    /// @notice Rests a PostOnly buy (`useCredit = false`, `withdrawProceeds = false`) and proves it: the whole order
    ///         rested (`restedLots == lots`, nothing filled), and `Δwallet == transferredIn == lots·ownTicks·cu` — the
    ///         escrow is a measured delta equal to the engine's report (D-017). The product's engine credit may only
    ///         grow: the cross walk may evict the product's own expired quotes into it (E-35), which the caller then
    ///         collects and books.
    /// @return escrow the collateral that left the wallet for this order, raw base units
    function restMeasured(IEventsEngine engine, IEngineLens lens, IERC20 collateral, PlaceArgs memory a, uint64 cu)
        internal
        returns (uint256 escrow, PlaceResult memory r)
    {
        uint256 w0 = collateral.balanceOf(address(this));
        uint64 c0 = lens.creditOf(a.marketId, address(this));
        r = engine.placeOrder(a);
        uint256 w1 = collateral.balanceOf(address(this));
        uint64 c1 = lens.creditOf(a.marketId, address(this));
        uint256 ownTicks = a.kind == KIND_BUY_YES ? a.priceTicks : PAIR_TICKS - a.priceTicks;
        escrow = uint256(a.lots) * ownTicks * cu;
        bool ok = a.orderType == ORDER_POST_ONLY && !a.useCredit && !a.withdrawProceeds
            && (a.kind == KIND_BUY_YES || a.kind == KIND_BUY_NO) && r.restedLots == a.lots && r.filledLots == 0
            && r.cashSpent == 0 && r.creditUsed == 0 && r.withdrawn == 0 && w0 >= w1 && w0 - w1 == r.transferredIn
            && r.transferredIn == escrow && c1 >= c0;
        if (!ok) revert EngineAccountingMismatch();
    }

    /// @notice Withdraws all of the product's engine credit in `m` and proves it landed (`Δwallet == amount`, credit 0).
    function collectCreditMeasured(IEventsEngine engine, IEngineLens lens, IERC20 collateral, bytes32 m)
        internal
        returns (uint256 amount)
    {
        amount = lens.creditOf(m, address(this));
        if (amount == 0) return 0;
        uint256 w0 = collateral.balanceOf(address(this));
        engine.withdrawCredit(m, uint64(amount));
        uint256 w1 = collateral.balanceOf(address(this));
        if (!(w1 >= w0 && w1 - w0 == amount && lens.creditOf(m, address(this)) == 0)) revert EngineAccountingMismatch();
    }

    /// @notice Merges `lots` complete sets and withdraws them (`mergeSet(m, lots, true)`) with no credit standing
    ///         beforehand, proving `Δwallet == withdrawn == cash == lots·1000·cu` and one lot off each free side.
    function mergeMeasured(IEventsEngine engine, IEngineLens lens, IERC20 collateral, bytes32 m, uint64 lots, uint64 cu)
        internal
        returns (uint256 cash)
    {
        uint256 w0 = collateral.balanceOf(address(this));
        PositionView memory p0 = lens.positionOf(m, address(this));
        (uint64 got, uint64 withdrawn) = engine.mergeSet(m, lots, true);
        uint256 w1 = collateral.balanceOf(address(this));
        PositionView memory p1 = lens.positionOf(m, address(this));
        cash = uint256(lots) * PAIR_TICKS * cu;
        bool ok = p0.credit == 0 && got == cash && withdrawn == cash && w1 >= w0 && w1 - w0 == cash && p1.credit == 0
            && p0.yesFree >= p1.yesFree && p0.yesFree - p1.yesFree == lots && p0.noFree >= p1.noFree
            && p0.noFree - p1.noFree == lots;
        if (!ok) revert EngineAccountingMismatch();
    }

    /// @notice One full `redeem` of the product's position in a terminal market (drains its own orders first, T05)
    ///         and proves `Δwallet == total` and that nothing is left in the engine.
    function redeemAllMeasured(IEventsEngine engine, IEngineLens lens, IERC20 collateral, bytes32 m)
        internal
        returns (uint256 total)
    {
        uint256 w0 = collateral.balanceOf(address(this));
        total = engine.redeem(m);
        uint256 w1 = collateral.balanceOf(address(this));
        PositionView memory p = lens.positionOf(m, address(this));
        bool empty = p.credit == 0 && p.lockedCash == 0 && p.yesFree == 0 && p.noFree == 0 && p.yesLocked == 0
            && p.noLocked == 0 && p.openOrders == 0;
        if (!(empty && w1 >= w0 && w1 - w0 == total)) revert EngineAccountingMismatch();
    }
}
