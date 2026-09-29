// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/settler/decide.ts — Book release,
// Ledger close and Market close are gone (EVM: storage stays; credits come back when positions clear, F-S2-03); what
// remains is settle/void, sweep, and `redeemFor` after the claim grace, skipping opted-out holders (T09).
/**
 * The settler's next action for one Window. Pure: plain data and the chain clock in, one action out.
 */
export interface SettleInput {
  nowSec: number;
  /** 0 open, 1 resolved, 2 voided. */
  state: number;
  expirySec: number;
  lockAtSec: number;
  openDeadlineSec: number;
  closeDeadlineSec: number;
  prints: { open: boolean; close: boolean; checkOpen: boolean; checkClose: boolean };
  check: { configured: boolean; admissionSec: number };
  resolvedSec: number;
  /** Seconds a holder may redeem their own position before the crank pays them (`redeemFor`). */
  redeemGraceSec: number;
  /** Live resting orders on the Window (`Market.orderCount`). */
  orderCount: number;
  /** Holders still owed a redemption (index candidates confirmed on chain), minus opted-out ones. */
  redeemable: readonly string[];
}

export type SettleAction =
  | { kind: "settle"; why: string }
  | { kind: "void"; why: string }
  | { kind: "sweep"; why: string }
  | { kind: "redeemFor"; holders: string[]; why: string }
  | { kind: "wait"; untilSec: number; why: string }
  | { kind: "done"; why: string };

/** Holders per pass per Window, so one crowded Window never starves the rest. */
export const REDEEM_BATCH = 6;
export const PRINT_POLL_SEC = 10;
export const AFTER_EXPIRY_SEC = 5;

function openWindow(i: SettleInput): SettleAction {
  const { open, close, checkOpen, checkClose } = i.prints;
  if (open && close) {
    const checkBound = i.expirySec + i.check.admissionSec;
    if (i.check.configured && !(checkOpen && checkClose) && i.nowSec <= checkBound) return { kind: "wait", untilSec: checkBound + 1, why: `both prints in; the cross-check stays open until ${checkBound}` };
    const single = i.check.configured && !(checkOpen && checkClose);
    return { kind: "settle", why: i.check.configured ? (single ? "both prints in; check incomplete past its bound (single source)" : "both prints and both checks in") : "both prints in" };
  }
  if (!open && i.nowSec > i.openDeadlineSec) return { kind: "void", why: `no open print by ${i.openDeadlineSec}` };
  if (!close && i.nowSec > i.closeDeadlineSec) return { kind: "void", why: `no close print by ${i.closeDeadlineSec}` };
  const printDue = !close && i.nowSec < i.expirySec ? i.expirySec + AFTER_EXPIRY_SEC : i.nowSec + PRINT_POLL_SEC;
  const deadlines = [!open ? i.openDeadlineSec + 1 : Infinity, !close ? i.closeDeadlineSec + 1 : Infinity];
  return { kind: "wait", untilSec: Math.min(printDue, ...deadlines), why: `waiting for ${[!open && "open", !close && "close"].filter(Boolean).join(" and ")} print` };
}

function terminal(i: SettleInput): SettleAction {
  // Resting orders are escrow nobody can use any more: sweep them back to their owners' credit first (A.2 `sweepExpired`).
  if (i.orderCount > 0) return { kind: "sweep", why: `${i.orderCount} orders still rest` };
  if (i.redeemable.length === 0) return { kind: "done", why: "every holder redeemed" };
  const graceEnds = i.resolvedSec + i.redeemGraceSec;
  if (i.nowSec < graceEnds) return { kind: "wait", untilSec: graceEnds, why: `${i.redeemable.length} holders in their claim grace until ${graceEnds}` };
  const batch = i.redeemable.slice(0, REDEEM_BATCH);
  return { kind: "redeemFor", holders: batch, why: `${batch.length} of ${i.redeemable.length} holders to pay` };
}

export function decideSettle(i: SettleInput): SettleAction {
  return i.state === 0 ? openWindow(i) : terminal(i);
}
