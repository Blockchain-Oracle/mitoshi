"use client";
/**
 * The pinned verdict for one of the user's calls (D-048): `getPinnedVerdict` answers call → settling → stamped → paid /
 * held from the chain (the engine's `Redeemed` witness survives the settler's auto-pay). The stream refreshes it on the
 * wallet's own events and on `WindowResolved`; after the close it is also re-read every 10 s until it is paid (or a
 * loss), so the auto-pay lands on screen without a prompt even with the stream down.
 */
import type { Address, MarketId, PinnedVerdictView, Reading } from "@cwf/core";
import { isOk } from "@cwf/core";
import { keys, usePortReading } from "@cwf/markets/react";

const AFTER_CLOSE_POLL_MS = 10_000;
const BEFORE_CLOSE_POLL_MS = 60_000;

export function usePinned(wallet: Address | null, marketId: MarketId, expirySec: number, nowMs: number): Reading<PinnedVerdictView | null> | null {
  const closed = nowMs > 0 && nowMs >= expirySec * 1000;
  return usePortReading(keys.verdict(wallet, marketId), (p) => p.getPinnedVerdict(wallet!, marketId), {
    enabled: wallet !== null,
    pollMs: (r) => {
      const v = r && isOk(r) ? r.value : null;
      if (v && (v.phase === "paid" || (v.phase === "stamped" && v.verdict?.outcome === "loss"))) return false;
      return closed ? AFTER_CLOSE_POLL_MS : BEFORE_CLOSE_POLL_MS;
    },
  });
}

/** The "done" states a card can be dismissed from: paid, a loss, or nothing held. */
export function isFinal(v: PinnedVerdictView | null | undefined): boolean {
  if (v === null) return true;
  if (!v) return false;
  return v.phase === "paid" || (v.phase === "stamped" && v.verdict?.outcome === "loss");
}
