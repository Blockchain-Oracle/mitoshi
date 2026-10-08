"use client";
/**
 * Exits with the app closed (S24.5; D-193, D-209): a Trading Balance position's Trail, take-profit and stop-loss handed
 * to Mitoshi's exit keeper. Three facts decide it: the position is held in the current Trading Balance (v2), one-tap is
 * armed (its session key signs the trigger, no prompt), and the owner's EXIT grant names the running keeper until the
 * Window ends — the one passkey confirmation, made here. A trigger is written through `/api/exits`; what the keeper does
 * comes back on the owner's `user:` stream (`exit`: sold; `exit-trail`: the stop moved). A position the keeper runs is
 * never also closed by the tab.
 */
import type { Address, Hex, MarketId, Side } from "@cwf/core";
import { exitTriggerToWire, type ExitFiredEvent, type ExitTrailEvent, type ExitTrigger } from "@cwf/core/exits";
import { subscribeTopic } from "@cwf/markets/stream";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ensureStream } from "@/features/prices/stream-config";
import type { SessionView } from "@/features/session/view";
import { webEnv } from "@/lib/env";
import { notify } from "@/lib/toast";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { TERMINAL } from "./copy";
import { money } from "./format";
import type { TerminalPosition } from "./terminal-positions";

/** An EXIT grant made here: the keeper sells at no less than the fair value less 15 % (the house quotes within it). */
export const EXIT_TOLERANCE_BPS = 1_500;
/** …and lasts 30 days; it is listed and stopped in Settings like every grant. */
export const EXIT_GRANT_SEC = 30 * 86_400;

export type ServerExitState = "unavailable" | "needs-grant" | "live";

/** The keeper's address from ops (`/exits/keeper`), or null when none runs. */
export function useExitKeeper(): Address | null {
  const base = webEnv.markets.opsUrl?.replace(/\/+$/, "") ?? null;
  const q = useQuery({
    queryKey: ["cwf", "exits", "keeper"],
    queryFn: async () => {
      const res = await fetch(`${base}/exits/keeper`, { headers: { accept: "application/json" } });
      if (!res.ok) return null;
      return ((await res.json()) as { keeper: Address | null }).keeper;
    },
    enabled: base !== null,
    staleTime: 5 * 60_000,
  });
  return q.data ?? null;
}

/** Whether `p`'s exits can run with the app closed now, need the EXIT grant first, or run only in the tab. */
export function serverExitState(p: TerminalPosition, view: SessionView, keeper: Address | null): ServerExitState {
  if (p.via !== "vault" || !keeper || !view.vault || view.status !== "armed") return "unavailable";
  if (p.vault && p.vault.toLowerCase() !== view.vault.toLowerCase()) return "unavailable";
  const g = view.exitGrant;
  if (!g || g.revoked || g.expiresAtSec < p.expirySec || g.actor.toLowerCase() !== keeper.toLowerCase()) return "needs-grant";
  if (g.caps.market && g.caps.market.toLowerCase() !== p.marketId.toLowerCase()) return "needs-grant";
  return "live";
}

// What the keeper holds per position, from `/api/exits` and the stream. In memory for the tab.
export interface ServerExit {
  status: "armed" | "firing" | "fired" | "cancelled" | "expired" | "gone";
  trailStopE8: bigint | null;
  lastError: string | null;
}

const keyOf = (marketId: string, side: Side) => `${marketId.toLowerCase()}:${side}`;
let exits = new Map<string, ServerExit>();
const listeners = new Set<() => void>();
const set = (marketId: string, side: Side, e: ServerExit | null) => {
  exits = new Map(exits);
  if (e) exits.set(keyOf(marketId, side), e);
  else exits.delete(keyOf(marketId, side));
  listeners.forEach((l) => l());
};

export const serverExitOf = (marketId: string, side: Side): ServerExit | null => exits.get(keyOf(marketId, side)) ?? null;
/** Whether the keeper runs this position's exits (the tab then doesn't fire them itself). */
export const keeperRuns = (marketId: string, side: Side): boolean => ["armed", "firing"].includes(serverExitOf(marketId, side)?.status ?? "");

export function useServerExit(marketId: string, side: Side): ServerExit | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => exits.get(keyOf(marketId, side)) ?? null,
    () => null,
  );
}

type Row = { market: string; side: Side; status: ServerExit["status"]; trailStopE8: string | null; lastError: string | null };
const fromRow = (r: Row): ServerExit => ({ status: r.status, trailStopE8: r.trailStopE8 === null ? null : BigInt(r.trailStopE8), lastError: r.lastError });

export interface ExitTargets {
  takeProfitBase: bigint | null;
  stopLossBase: bigint | null;
  trailBps: number | null;
  trailStopE8: bigint | null;
}

/**
 * Hands `p`'s exits to the keeper (all of them: a write replaces the last; all null cancels). Signed by the armed
 * session key; null on success, else why not, in words.
 */
export async function writeServerExit(p: TerminalPosition, targets: ExitTargets, view: SessionView, sign: (t: ExitTrigger) => Promise<Hex | null>): Promise<string | null> {
  if (!view.owner || !view.vault || !view.grant) return TERMINAL.keeper.noSession;
  const trigger: ExitTrigger = {
    owner: view.owner, vault: view.vault, chainId: TEMPO_CHAIN_ID, market: p.marketId as MarketId, side: p.side, grantId: view.grant.grantId,
    ...targets, nonce: BigInt(Date.now()), expiresAtSec: p.expirySec,
  };
  const signature = await sign(trigger).catch(() => null);
  if (!signature) return TERMINAL.keeper.noSession;
  try {
    const res = await fetch("/api/exits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trigger: exitTriggerToWire(trigger), signature }) });
    const body = (await res.json().catch(() => ({}))) as { exit?: Row; error?: string };
    if (!res.ok || !body.exit) return body.error ?? `exits ${res.status}`;
    set(p.marketId, p.side, fromRow(body.exit));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const REASON_TITLE = { trail: TERMINAL.trail.hit, tp: TERMINAL.exits.tpHit, sl: TERMINAL.exits.slHit } as const;

/**
 * The owner's keeper state, read once per owner (their server session) and then kept by the `user:` stream: a sale
 * becomes the "hit" toast — what it paid and, from the position's cost, what it locked — and a moved trail redraws.
 */
export function useServerExitFeed(owner: Address | null, costOf: (marketId: string, side: Side) => bigint | null): void {
  const cost = useRef(costOf);
  cost.current = costOf;
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    void fetch("/api/exits", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ exits: Row[] }>) : null))
      .then((body) => {
        if (cancelled || !body) return;
        for (const r of body.exits) if (r.status === "armed" || r.status === "firing") set(r.market, r.side, fromRow(r));
      })
      .catch(() => undefined);
    if (!ensureStream()) return () => void (cancelled = true);
    const off = subscribeTopic(`user:${owner.toLowerCase()}`, (events) => {
      for (const e of events) {
        if (e.event === "exit-trail") {
          const d = e.data as ExitTrailEvent;
          const was = serverExitOf(d.marketId, d.side);
          if (was) set(d.marketId, d.side, { ...was, trailStopE8: BigInt(d.trailStopE8) });
        } else if (e.event === "exit") {
          const d = e.data as ExitFiredEvent;
          const paid = BigInt(d.proceedsBase);
          const paidFor = cost.current(d.marketId, d.side);
          set(d.marketId, d.side, { status: "fired", trailStopE8: null, lastError: null });
          notify.item({ id: `exit-${d.marketId}-${d.side}`, title: REASON_TITLE[d.reason](d.symbol), description: TERMINAL.keeper.sold(money(paid), paidFor !== null ? money(paid - paidFor, true) : null) });
        }
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [owner]);
}
