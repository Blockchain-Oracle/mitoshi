"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/{useTerminalTrade.ts (`toggleTrail`), terminal-positions.ts
// (`useTabTrail`)} — Trail in the tab (S23e): it arms once the spot is more than the trail distance past break-even, its
// stop only moves in the position's favour, and when the spot comes back to it the tab closes the position with the
// same one-tap Close. It runs only while Mitoshi is open (the server-side keeper is S24, D-193), so arming is refused
// when the key that would sign the Close expires before the Window does.
import { useSigner } from "@cwf/markets/react";
import { useCallback, useEffect, useRef } from "react";
import { useSessionView } from "@/features/session";
import { tapFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { readWalletKey } from "@/providers/wallet/wallet-key-store";
import { TERMINAL } from "./copy";
import { rememberEntry } from "./entries";
import { exitHit, ratchet, trailEligible, trailHit, trailStart } from "./position-value";
import { tradeSettings } from "./settings";
import type { TerminalPosition } from "./terminal-positions";
import type { PositionValue } from "./usePositionValue";
import { trailWords } from "./ui/TradeButtons";

/** A refused trail close (a requote outside the tolerance) is retried no sooner than this. */
const RETRY_MS = 3_000;

/**
 * Whether the key that would sign an unattended Close lasts until the Window does: the Trading Balance's grant for a
 * vault position, the wallet's one-tap key for a wallet one.
 */
export function useSignerLasts() {
  const { address } = useSigner();
  const view = useSessionView();
  return useCallback(
    (p: TerminalPosition) => {
      const expiry = p.via === "vault" ? (view.status === "armed" ? (view.grant?.expiresAtSec ?? 0) : 0) : address ? (readWalletKey(TEMPO_CHAIN_ID, address)?.expirySec ?? 0) : 0;
      return expiry >= p.expirySec;
    },
    [address, view],
  );
}

/** Arms or removes the trail on a position (the TRAIL button). */
export function useTrailToggle() {
  const { address } = useSigner();
  const view = useSessionView();
  return useCallback(
    (p: TerminalPosition, v: PositionValue | null) => {
      tapFeedback();
      const id = `trail-${p.marketId}`;
      if (p.trailStop !== null) {
        rememberEntry(p.marketId, p.side, p.entrySpot ?? 0, null);
        return void notify.item({ id, title: TERMINAL.trail.off(p.asset) });
      }
      const pct = tradeSettings().trailPct;
      if (!v || v.spot === null || v.breakEven === null || !trailEligible(p.side, v.spot, v.breakEven, pct)) {
        return void notify.item({ id, type: "warning", title: TERMINAL.buttons.needMove(trailWords(pct)) });
      }
      // The Close a hit sends must sign without a prompt until the Window closes.
      const signerExpiry = p.via === "vault" ? (view.status === "armed" ? (view.grant?.expiresAtSec ?? 0) : 0) : address ? (readWalletKey(TEMPO_CHAIN_ID, address)?.expirySec ?? 0) : 0;
      if (signerExpiry < p.expirySec) return void notify.item({ id, type: "warning", title: TERMINAL.trail.needsKey, description: TERMINAL.trail.needsKeyBody });
      const stop = trailStart(p.side, v.spot, v.breakEven, pct);
      rememberEntry(p.marketId, p.side, p.entrySpot ?? v.spot, stop);
      notify.item({ id, title: TERMINAL.trail.armed(p.asset), description: TERMINAL.trail.armedBody(trailWords(pct)) });
    },
    [address, view],
  );
}

export type ExitReason = "trail" | "tp" | "sl";

/**
 * One row's exits in the tab: the take-profit and stop-loss on what Close pays (D-197) and the trail on its asset's
 * line — ratchet on every committed spot, close when one is hit, a refused close retried no sooner than 3 s.
 */
export function useRowTrail(p: TerminalPosition, v: PositionValue, close: (p: TerminalPosition, v: PositionValue, why: ExitReason) => Promise<void> | void): void {
  const lastTry = useRef(0);
  const latest = useRef({ p, v, close });
  latest.current = { p, v, close };
  useEffect(() => {
    const { p: pos, v: val, close: fire } = latest.current;
    if (val.locked || val.valueBase === null) return;
    const hit = exitHit(val.valueBase, pos.tpBase, pos.slBase);
    if (hit) {
      if (Date.now() - lastTry.current < RETRY_MS) return;
      lastTry.current = Date.now();
      void fire(pos, val, hit);
    }
  }, [v.valueBase]);
  useEffect(() => {
    const { p: pos, v: val, close: fire } = latest.current;
    if (pos.trailStop === null || val.spot === null || val.locked) return;
    if (trailHit(pos.side, pos.trailStop, val.spot)) {
      if (Date.now() - lastTry.current < RETRY_MS) return;
      lastTry.current = Date.now();
      void fire(pos, val, "trail");
      return;
    }
    const next = ratchet(pos.side, pos.trailStop, val.spot, tradeSettings().trailPct);
    if (next !== pos.trailStop) rememberEntry(pos.marketId, pos.side, pos.entrySpot ?? val.spot, next);
  }, [v.spot]);
}
