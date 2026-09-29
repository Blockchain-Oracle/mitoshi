// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EngineStorage} from "../EngineStorage.sol";
import {IEngineErrors as E} from "../EngineErrors.sol";
import {IEventsEngineEvents as Ev} from "../interfaces/IEventsEngineEvents.sol";
import {IPrintVerifier, PrintQuery} from "../interfaces/IPrintVerifier.sol";
import {BookLib, MarketCtx} from "./BookLib.sol";
import {PrintLib} from "./PrintLib.sol";
import {Grid} from "./Grid.sol";
import "../EngineTypes.sol";

// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:anchor/programs/agari-events/src/instructions/
// {print_rules.rs,copy_open_from_prev.rs,resolve_rules.rs,resolve_window.rs,redeem.rs}, matching/redeem.rs and
// anchor/crates/agari-common/src/print/normalize.rs.

/// @notice What one redeem did (the engine pays or holds `total`, then emits `Redeemed`).
struct Redemption {
    uint32 mIdx;
    uint48 seq;
    uint64 yesLots;
    uint64 noLots;
    uint64 payout; // the outcome payout alone
    uint64 credit; // credit (and any escrow) returned
    uint64 total; // credit + payout
}

/// @title Prints (PD-6 admission, verification, normalization, copy-open), settlement and void (E-43…E-51), and the
///        three redeems (E-53…E-55). Permissionless except where a holder's own position is paid.
/// @dev External library, delegatecalled by `EventsEngine`. Modes never block anything here (E-18).
library ResolveLib {
    // ------------------------------------------------------------------------------------------------ prints

    /// @notice PD-6 in Agari's order: slot → not terminal → the version's source for the slot → empty slot (first
    ///         valid print wins) → `now ≥ T + minDelay` → `now ≤ deadline` → verify → normalize → record.
    function recordPrint(bytes32 m, uint8 which, bytes calldata proof) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Market storage mk = _market(l, m);
        if (which > WHICH_CHECK_CLOSE) revert E.BadPrintSlot();
        if (mk.state != STATE_OPEN) revert E.MarketAlreadyTerminal();
        PolicyVersion storage v = l.versions[mk.seriesIdx][mk.policyVersion];
        bool isCheck = which >= WHICH_CHECK_OPEN;
        PrintPolicy memory p = isCheck ? v.check : v.primary;
        if (p.source == SOURCE_NONE) revert E.WrongPrintSource();
        if (!PrintLib.isEmpty(_slot(mk, which))) revert E.PrintAlreadyRecorded();
        uint40 t = (which == WHICH_OPEN || which == WHICH_CHECK_OPEN) ? mk.tradingStart : mk.expiry;
        if (block.timestamp < uint256(t) + p.minDelaySec) revert E.PrintTooEarly();
        uint256 deadline = which == WHICH_OPEN
            ? mk.openDeadline
            : which == WHICH_CLOSE ? mk.closeDeadline : uint256(t) + v.checkAdmissionSec;
        if (block.timestamp > deadline) revert E.PrintTooLate();

        (int256 price, int8 expo, uint40 sourceTs, uint8 signers) = IPrintVerifier(p.verifier).verifyPrint(
            proof, PrintQuery(m, which, t, p.feedId, p.strictSec, p.graceSec, p.minDelaySec, p.barLenSec, p.maxConfBps, p.statusMask)
        );
        int64 priceE8 = normalize(price, expo);
        _setSlot(mk, which, PrintLib.pack(Print(priceE8, sourceTs, p.source, signers, 0)));
        emit Ev.PrintRecorded(m, ++mk.eventSeq, which, p.source, priceE8, sourceTs, signers, false);
    }

    /// @notice E-49: to expo −8, exact for sources at or coarser than 1e-8, a floor for finer ones; `0 < q ≤ int64`.
    function normalize(int256 price, int8 expo) internal pure returns (int64) {
        if (price <= 0 || expo > 0 || expo < MIN_SOURCE_EXPO) revert E.InvalidPrintValue();
        int256 q;
        if (expo >= PRINT_EXPO) {
            if (price > type(int64).max) revert E.InvalidPrintValue();
            q = price * int256(10 ** uint256(int256(expo - PRINT_EXPO)));
        } else {
            q = price / int256(10 ** uint256(int256(PRINT_EXPO - expo)));
        }
        if (q <= 0 || q > type(int64).max) revert E.InvalidPrintValue();
        return int64(q);
    }

    /// @notice E-48: a back-to-back Window's opening print is its predecessor's closing print at the same instant,
    ///         same Series and policy version — copied, never re-proven (a Friday close never becomes a Monday open).
    function copyOpenFromPrev(bytes32 m, bytes32 prev) external {
        if (m == prev) revert E.PrintNotAdjacent();
        EngineStorage.Layout storage l = EngineStorage.layout();
        Market storage mk = _market(l, m);
        Market storage pv = _market(l, prev);
        if (pv.seriesIdx != mk.seriesIdx) revert E.PrintNotAdjacent();
        if (mk.state != STATE_OPEN) revert E.MarketAlreadyTerminal();
        if (!PrintLib.isEmpty(mk.open)) revert E.PrintAlreadyRecorded();
        if (block.timestamp > mk.openDeadline) revert E.PrintTooLate();
        if (pv.expiry != mk.tradingStart || pv.policyVersion != mk.policyVersion) revert E.PrintNotAdjacent();
        if (PrintLib.isEmpty(pv.close)) revert E.PrintsMissing();

        Print memory open = PrintLib.unpack(pv.close);
        open.flags |= PRINT_FLAG_COPIED_FROM_PREV;
        mk.open = PrintLib.pack(open);
        emit Ev.PrintRecorded(m, ++mk.eventSeq, WHICH_OPEN, open.source, open.priceE8, open.sourceTs, open.signers, true);

        uint256 checkDeadline = uint256(mk.tradingStart) + l.versions[mk.seriesIdx][mk.policyVersion].checkAdmissionSec;
        if (!PrintLib.isEmpty(pv.checkClose) && PrintLib.isEmpty(mk.checkOpen) && block.timestamp <= checkDeadline) {
            Print memory check = PrintLib.unpack(pv.checkClose);
            check.flags |= PRINT_FLAG_COPIED_FROM_PREV;
            mk.checkOpen = PrintLib.pack(check);
            emit Ev.PrintRecorded(
                m, ++mk.eventSeq, WHICH_CHECK_OPEN, check.source, check.priceE8, check.sourceTs, check.signers, true
            );
        }
    }

    // ------------------------------------------------------------------------------------------------ settle / void

    /// @notice E-50: both primary prints; with a check source, both checks or the check window over (else
    ///         `CrossCheckPending`); any present pair diverging beyond the bound voids; close ≥ open → Up (PD-3).
    function settle(bytes32 m) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Market storage mk = _market(l, m);
        if (mk.state != STATE_OPEN) revert E.MarketAlreadyTerminal();
        if (PrintLib.isEmpty(mk.open) || PrintLib.isEmpty(mk.close)) revert E.PrintsMissing();
        PolicyVersion storage v = l.versions[mk.seriesIdx][mk.policyVersion];
        int64 openE8 = PrintLib.priceE8(mk.open);
        int64 closeE8 = PrintLib.priceE8(mk.close);
        bool single;
        if (v.check.source != SOURCE_NONE) {
            bool hasOpen = !PrintLib.isEmpty(mk.checkOpen);
            bool hasClose = !PrintLib.isEmpty(mk.checkClose);
            bool both = hasOpen && hasClose;
            // An early settler can't skip a check that may still land.
            if (!both && block.timestamp <= uint256(mk.expiry) + v.checkAdmissionSec) revert E.CrossCheckPending();
            uint16 bps = v.maxDivergenceBps;
            if (
                (hasOpen && diverges(openE8, PrintLib.priceE8(mk.checkOpen), bps))
                    || (hasClose && diverges(closeE8, PrintLib.priceE8(mk.checkClose), bps))
            ) {
                _resolve(mk, m, STATE_VOIDED, WINNER_VOID, PAYOUT_VOID, PAYOUT_VOID, VOID_CROSS_CHECK_DIVERGENCE, false);
                return;
            }
            single = !both;
        }
        bool up = closeE8 >= openE8;
        _resolve(
            mk,
            m,
            STATE_RESOLVED,
            up ? WINNER_YES : WINNER_NO,
            up ? PAYOUT_DENOMINATOR : 0,
            up ? 0 : PAYOUT_DENOMINATOR,
            VOID_NONE,
            single
        );
    }

    /// @notice E-51: a primary print is missing **and** its admission deadline has passed (at the deadline the print is
    ///         still admissible — the clock makes print and void mutually exclusive). No admin void exists.
    function voidExpired(bytes32 m) external {
        EngineStorage.Layout storage l = EngineStorage.layout();
        Market storage mk = _market(l, m);
        if (mk.state != STATE_OPEN) revert E.MarketAlreadyTerminal();
        bool openMissed = PrintLib.isEmpty(mk.open) && block.timestamp > mk.openDeadline;
        bool closeMissed = PrintLib.isEmpty(mk.close) && block.timestamp > mk.closeDeadline;
        if (!openMissed && !closeMissed) revert E.SettlementWindowOpen();
        _resolve(mk, m, STATE_VOIDED, WINNER_VOID, PAYOUT_VOID, PAYOUT_VOID, VOID_MISSING_PRINT, false);
    }

    /// @notice `|p − c| × 10,000 > bps × p` in int256 over the normalized prices.
    function diverges(int64 primary, int64 check, uint16 bps) internal pure returns (bool) {
        int256 gap = int256(primary) - int256(check);
        if (gap < 0) gap = -gap;
        return gap * 10_000 > int256(uint256(bps)) * int256(primary);
    }

    function _resolve(
        Market storage mk,
        bytes32 m,
        uint8 state,
        uint8 winner,
        uint32 payoutYes,
        uint32 payoutNo,
        uint8 voidReason,
        bool single
    ) private {
        mk.state = state;
        mk.payoutYes = payoutYes;
        mk.payoutNo = payoutNo;
        mk.voidReason = voidReason;
        mk.resolvedTs = uint40(block.timestamp);
        if (single) mk.flags |= MARKET_FLAG_SINGLE_SOURCE;
        emit Ev.WindowResolved(
            m, ++mk.eventSeq, state, winner, payoutYes, payoutNo, voidReason, single, PrintLib.priceE8(mk.open), PrintLib.priceE8(mk.close)
        );
    }

    // ------------------------------------------------------------------------------------------------ redeem

    /// @notice E-53 + T03 + T05: terminal; the holder's own resting orders are removed first (escrow back to credit);
    ///         pays `credit + lockedCash + ⌊(yes·1000·cu·yN + no·1000·cu·nN)/1e7⌋` with locked balances folded in; the
    ///         position is deleted (both slots zero → storage credits), so a second redeem refuses `NothingToRedeem`.
    function redeemFull(bytes32 m, address holder) external returns (Redemption memory r) {
        (EngineStorage.Layout storage l, Market storage mk, MarketCtx memory c) = _terminal(m);
        _drain(l, c, holder);
        Position storage p = l.positions[c.mIdx][holder];
        r.yesLots = p.yesFree + p.yesLocked;
        r.noLots = p.noFree + p.noLocked;
        r.credit = p.credit + p.lockedCash;
        if (r.yesLots == 0 && r.noLots == 0 && r.credit == 0) revert E.NothingToRedeem();
        r.payout = Grid.redeemPayout(r.yesLots, r.noLots, c.cu, mk.payoutYes, mk.payoutNo);
        r.total = r.credit + r.payout;
        delete l.positions[c.mIdx][holder];
        (r.mIdx, r.seq) = (c.mIdx, c.seq);
    }

    /// @notice E-54 + T04: `lots` of one outcome (0 YES, 1 NO) from the holder's free balance for
    ///         `⌊lots·1000·cu·num/1e7⌋`; any holder; credit untouched; own orders drained first (F-S2-06).
    function redeemPartial(bytes32 m, address holder, uint8 outcome, uint64 lots) external returns (Redemption memory r) {
        (EngineStorage.Layout storage l, Market storage mk, MarketCtx memory c) = _terminal(m);
        if (outcome > 1) revert E.InvalidOrderArgs();
        if (lots == 0) revert E.InvalidQuantity();
        _drain(l, c, holder);
        Position storage p = l.positions[c.mIdx][holder];
        if (outcome == 0) {
            if (lots > p.yesFree) revert E.InsufficientOutcome();
            p.yesFree -= lots;
            (r.yesLots, r.payout) = (lots, Grid.partialPayout(lots, c.cu, mk.payoutYes));
        } else {
            if (lots > p.noFree) revert E.InsufficientOutcome();
            p.noFree -= lots;
            (r.noLots, r.payout) = (lots, Grid.partialPayout(lots, c.cu, mk.payoutNo));
        }
        r.total = r.payout;
        (r.mIdx, r.seq) = (c.mIdx, c.seq);
    }

    /// T05: removes every resting order of `holder` in this market (≤ 16), escrow back to its position.
    function _drain(EngineStorage.Layout storage l, MarketCtx memory c, address holder) private {
        Position storage p = l.positions[c.mIdx][holder];
        uint32 idx = p.orderHead;
        while (idx != 0) {
            uint32 next = l.nodes[idx].holderNext;
            BookLib.removeOrder(l, c, idx, REMOVE_REDEEM_DRAIN);
            idx = next;
        }
    }

    function _terminal(bytes32 m)
        private
        returns (EngineStorage.Layout storage l, Market storage mk, MarketCtx memory c)
    {
        l = EngineStorage.layout();
        mk = _market(l, m);
        if (mk.state == STATE_OPEN) revert E.MarketNotTerminal();
        c = MarketCtx(m, mk.mIdx, ++mk.eventSeq, l.series[mk.seriesIdx].cashUnit, uint40(block.timestamp));
    }

    // ------------------------------------------------------------------------------------------------ helpers

    function _market(EngineStorage.Layout storage l, bytes32 m) private view returns (Market storage mk) {
        mk = l.markets[m];
        if (mk.mIdx == 0) revert E.UnknownMarket();
    }

    function _slot(Market storage mk, uint8 which) private view returns (uint128) {
        if (which == WHICH_OPEN) return mk.open;
        if (which == WHICH_CLOSE) return mk.close;
        if (which == WHICH_CHECK_OPEN) return mk.checkOpen;
        return mk.checkClose;
    }

    function _setSlot(Market storage mk, uint8 which, uint128 v) private {
        if (which == WHICH_OPEN) mk.open = v;
        else if (which == WHICH_CLOSE) mk.close = v;
        else if (which == WHICH_CHECK_OPEN) mk.checkOpen = v;
        else mk.checkClose = v;
    }
}
