"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/{useTerminalTrade.ts (`toggleTrail`), terminal-positions.ts
// (`useTabTrail`)} — Trail in the tab (S23e): it arms once the spot is more than the trail distance past break-even, its
// stop only moves in the position's favour, and when the spot comes back to it the tab closes the position with the
// same one-tap Close. It runs only while Mitoshi is open (the server-side keeper is S24, D-193), so arming is refused
// when the key that would sign the Close expires before the Window does.
import { useSigner } from "@cwf/markets/react";
import { useCallback, useEffect, useRef } from "react";
import { useSessionActions, useSessionView } from "@/features/session";
import { tapFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { readWalletKey } from "@/providers/wallet/wallet-key-store";
import { TERMINAL } from "./copy";
import { rememberEntry } from "./entries";
import type { ExitReason } from "@cwf/core/exits";
import { exitHit, ratchet, trailEligible, trailHit, trailStart } from "./position-value";
import { tradeSettings } from "./settings";
import { keeperRuns, serverExitState, useExitKeeper, writeServerExit } from "./server-exits";
import type { TerminalPosition } from "./terminal-positions";
import type { PositionValue } from "./usePositionValue";
import { trailWords } from "./ui/TradeButtons";

/** A refused trail close (a requote outside the tolerance) is retried no sooner than this. */
const RETRY_MS = 3_000;

/**
 * When the key that would sign an unattended Close expires: the Trading Balance's grant for a vault position, the
 * wallet's one-tap key for a wallet one. A Boost's close is signed by the passkey (Q-032's default), so never.
 */
function signerExpiryOf(p: TerminalPosition, view: ReturnType<typeof useSessionView>, address: string | null): number {
  if (p.via === "boost") return 0;
  // The session grant lives on the current vault: a position left on v1 has no unattended signer (S24.2).
  if (p.via === "vault") return view.status === "armed" && (!p.vault || !view.vault || p.vault.toLowerCase() === view.vault.toLowerCase()) ? (view.grant?.expiresAtSec ?? 0) : 0;
  return address ? (readWalletKey(TEMPO_CHAIN_ID, address as `0x${string}`)?.expirySec ?? 0) : 0;
}

/** What an exit that can't run unattended says: turn on one-tap, or — on a Boost — that its close asks for the passkey. */
export const unattendedRefusal = (p: TerminalPosition) =>
  p.via === "boost" ? { title: TERMINAL.trail.boostPasskey, description: TERMINAL.trail.boostPasskeyBody } : { title: TERMINAL.trail.needsKey, description: TERMINAL.trail.needsKeyBody };

/** Whether the key that would sign an unattended Close lasts until the Window does. */
export function useSignerLasts() {
  const { address } = useSigner();
  const view = useSessionView();
  return useCallback((p: TerminalPosition) => signerExpiryOf(p, view, address) >= p.expirySec, [address, view]);
}

/** Arms or removes the trail on a position (the TRAIL button); with the keeper running it (S24.5), it is written there too. */
export function useTrailToggle() {
  const { address } = useSigner();
  const view = useSessionView();
  const actions = useSessionActions();
  const keeper = useExitKeeper();
  return useCallback(
    (p: TerminalPosition, v: PositionValue | null) => {
      tapFeedback();
      const id = `trail-${p.marketId}`;
      const server = serverExitState(p, view, keeper) === "live";
      // A trail written to the keeper carries the position's take-profit and stop-loss too (a write replaces the last).
      const toKeeper = (trail: { bps: number; stop: number } | null) =>
        void writeServerExit(p, { takeProfitBase: p.tpBase, stopLossBase: p.slBase, trailBps: trail?.bps ?? null, trailStopE8: trail ? BigInt(Math.round(trail.stop * 1e8)) : null }, view, actions.signExit).then(
          (why) => why && notify.item({ id: `${id}-keeper`, type: "warning", title: TERMINAL.keeper.notStored(p.asset), description: TERMINAL.keeper.notStoredBody(why) }),
        );
      if (p.trailStop !== null) {
        rememberEntry(p.entryKey, p.side, p.entrySpot ?? 0, null);
        if (server) toKeeper(null);
        return void notify.item({ id, title: TERMINAL.trail.off(p.asset) });
      }
      const pct = tradeSettings().trailPct;
      if (!v || v.spot === null || v.breakEven === null || !trailEligible(p.side, v.spot, v.breakEven, pct)) {
        return void notify.item({ id, type: "warning", title: TERMINAL.buttons.needMove(trailWords(pct)) });
      }
      // The tab's Close a hit sends must sign without a prompt until the Window closes; the keeper's sale needs no key.
      if (!server && signerExpiryOf(p, view, address) < p.expirySec) return void notify.item({ id, type: "warning", ...unattendedRefusal(p) });
      const stop = trailStart(p.side, v.spot, v.breakEven, pct);
      rememberEntry(p.entryKey, p.side, p.entrySpot ?? v.spot, stop);
      if (server) toKeeper({ bps: Math.round(pct * 10_000), stop });
      notify.item({ id, title: TERMINAL.trail.armed(p.asset), description: server ? TERMINAL.keeper.armedBody(trailWords(pct)) : TERMINAL.trail.armedBody(trailWords(pct)) });
    },
    [address, view, actions, keeper],
  );
}

export type { ExitReason } from "@cwf/core/exits";

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
    // The keeper runs this one (S24.5): it sells with the app open or closed, so the tab doesn't race it.
    if (val.locked || val.valueBase === null || keeperRuns(pos.marketId, pos.side)) return;
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
      if (keeperRuns(pos.marketId, pos.side) || Date.now() - lastTry.current < RETRY_MS) return;
      lastTry.current = Date.now();
      void fire(pos, val, "trail");
      return;
    }
    const next = ratchet(pos.side, pos.trailStop, val.spot, tradeSettings().trailPct);
    if (next !== pos.trailStop) rememberEntry(pos.entryKey, pos.side, pos.entrySpot ?? val.spot, next);
  }, [v.spot]);
}
