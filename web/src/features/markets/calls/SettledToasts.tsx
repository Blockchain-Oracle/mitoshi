"use client";
/**
 * The app-wide "your Window settled" toast (D-048; ux-audit fix 2): wherever the user is in the app, a call of theirs
 * that settles says so — with its stamp's word — and the pinned card on /markets carries the rest. S23 (RV-16, D-202):
 * one toast per Window (`settle-<marketId>`), two-phase — a won Window shows "Paying…" from its stamp and the same toast
 * becomes "Paid $X" when the payout lands, with the win cue; a held payout says where to collect it. A lazy island in
 * the app layout; it reads only the calls this device placed, and nothing when signed out.
 */
import type { Address } from "@cwf/core";
import { isOk } from "@cwf/core";
import { formatCadence, verdictStrings } from "@cwf/core/copy";
import { useEffect } from "react";
import { formatBaseUnits } from "@cwf/core/units";
import { useNowMs } from "@/lib/clock";
import { closeFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { VERDICT_UI } from "../copy";
import type { PlacedCall } from "../data/calls-store";
import { useCalls } from "../data/useCalls";
import { usePinned } from "./usePinned";

const SEEN = "cwf.settledToasts.v1";

function seen(id: string): boolean {
  try {
    return (window.sessionStorage.getItem(SEEN) ?? "").split(",").includes(id);
  } catch {
    return false;
  }
}

function markSeen(id: string): void {
  try {
    const list = (window.sessionStorage.getItem(SEEN) ?? "").split(",").filter(Boolean);
    window.sessionStorage.setItem(SEEN, [...list.slice(-40), id].join(","));
  } catch {
    // no storage: the toast may repeat after a reload, never within a page
  }
}

function Watch({ wallet, call }: { wallet: Address; call: PlacedCall }) {
  const nowMs = useNowMs();
  const pinned = usePinned(wallet, call.marketId, call.expirySec, nowMs);
  const view = pinned && isOk(pinned) ? pinned.value : null;
  const outcome = view && (view.phase === "stamped" || view.phase === "paid" || view.phase === "held") && view.verdict ? view.verdict.outcome : null;
  const phase = outcome ? view!.phase : null;
  useEffect(() => {
    // A call that settled before this page loaded is shown on its card, not re-announced.
    if (!outcome || !phase || nowMs - call.expirySec * 1000 > 30 * 60_000) return;
    const key = `${call.marketId}:${call.side}:${phase}`;
    if (seen(key)) return;
    markSeen(key);
    const id = `settle-${call.marketId}`;
    const title = VERDICT_UI.settledToast(call.asset, formatCadence(call.intervalSec));
    const word = verdictStrings(outcome).line;
    if (outcome === "win" && phase === "stamped") return void notify.item({ id, type: "loading", title, description: VERDICT_UI.paying(word) });
    if (phase === "held") return void notify.item({ id, title, description: VERDICT_UI.held(word) });
    if (outcome === "win" && phase === "paid") {
      closeFeedback(1);
      const paid = view?.paidBase != null ? `$${formatBaseUnits(view.paidBase, call.decimals, { minDp: 2, maxDp: 2 })}` : null;
      return void notify.item({ id, title, description: paid ? VERDICT_UI.paid(word, paid) : VERDICT_UI.settledToastBody(word) });
    }
    if (seen(`${call.marketId}:${call.side}:announced`)) return;
    markSeen(`${call.marketId}:${call.side}:announced`);
    if (outcome === "loss") closeFeedback(-1);
    notify.item({ id, title, description: VERDICT_UI.settledToastBody(word) });
  }, [outcome, phase, call, nowMs, view?.paidBase]);
  return null;
}

export default function SettledToasts() {
  const { address } = useWalletSession();
  const calls = useCalls(address);
  const nowMs = useNowMs();
  if (!address || nowMs === 0) return null;
  // Only calls near or past their close need watching; the rest have nothing to settle yet.
  const due = calls.filter((c) => c.expirySec * 1000 - nowMs < 60_000 && nowMs - c.expirySec * 1000 < 30 * 60_000);
  return (
    <>
      {due.map((c) => (
        <Watch key={`${c.marketId}:${c.side}`} wallet={address} call={c} />
      ))}
    </>
  );
}
