"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/terminal-positions.ts — Mitoshi's three homes for a
// position: the wallet's own (the engine's balances, `usePositions`), the Trading Balance's (`useVaultBets`, held by
// the vault for its owner) and a Boost (the LeverageReserve's, part fronted, S23d). No paper positions (D-191).
import type { Address, LaneSet, MarketId, Side } from "@cwf/core";
import { listLeveragePositionsOf } from "@cwf/markets/leverage";
import { usePositions, useReadingQuery, useVaultBets } from "@cwf/markets/react";
import { useMemo } from "react";
import { entryOf, useEntries } from "./entries";
import { useFreshFills, withFreshFills } from "./fresh-fills";

/** The Boost reads' cache keys: shared with `/portfolio`'s Boost list, so a close here refreshes both. */
export const BOOST_KEYS = ["cwf", "boost"] as const;

/** One open position on the screen, in either home, with what the chart needs. */
export interface TerminalPosition {
  id: string;
  /** Where it is held: the wallet itself, the Trading Balance (the vault's sell lane, 23d), or a Boost (the reserve's). */
  via: "wallet" | "vault" | "boost";
  /** The key of this position's entry record (Entry line, trail, TP/SL): its Window, or its Boost. */
  entryKey: string;
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  side: Side;
  heldRaw: bigint;
  costBase: bigint;
  decimals: number;
  /** The spot when it was opened in this browser (the Entry line and PnL band); null when opened elsewhere. */
  entrySpot: number | null;
  trailStop: number | null;
  /** Take-profit and stop-loss on what Close pays (23e); null when unset. */
  tpBase: bigint | null;
  slBase: bigint | null;
  openedAtMs: number;
  /** A Trading Balance position: the vault holding it (v1 positions stay on v1 until sold or settled, S24.2). */
  vault?: Address;
  /** A Boost: its id, the reserve's claim repaid first out of a sale, and the multiple. */
  boost?: { positionId: bigint; frontedBase: bigint; leverageBps: number };
}

export function useTerminalPositions(address: Address | null, set: LaneSet | null): TerminalPosition[] {
  const wallet = usePositions(address);
  const vault = useVaultBets(address);
  const boosts = useReadingQuery([...BOOST_KEYS, "positions", address ?? ""], () => listLeveragePositionsOf(address!), { enabled: address !== null, pollMs: 10_000 });
  const entries = useEntries();
  const fresh = useFreshFills();
  return useMemo(() => {
    const out: TerminalPosition[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    for (const r of wallet?.ok ? wallet.value : []) {
      if (r.balanceUpRaw === 0n && r.balanceDownRaw === 0n) continue;
      const side: Side = r.balanceUpRaw >= r.balanceDownRaw ? "up" : "down";
      const e = entryOf(entries, r.marketId, side);
      out.push({
        id: `w:${r.marketId}`, via: "wallet", entryKey: r.marketId, marketId: r.marketId, asset: r.asset, intervalSec: r.intervalSec, expirySec: r.expirySec, side,
        heldRaw: side === "up" ? r.balanceUpRaw : r.balanceDownRaw, costBase: r.costBasisBase, decimals: r.decimals,
        entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? 0, tpBase: e?.tpBase ? BigInt(e.tpBase) : null, slBase: e?.slBase ? BigInt(e.slBase) : null,
      });
    }
    for (const b of vault?.ok ? vault.value : []) {
      if (b.state !== "open" || (b.upRaw === 0n && b.downRaw === 0n) || b.expirySec + 3_600 < nowSec) continue;
      const side: Side = b.upRaw >= b.downRaw ? "up" : "down";
      const e = entryOf(entries, b.marketId, side);
      out.push({
        id: `v:${b.vault}:${b.marketId}`, via: "vault", vault: b.vault, entryKey: b.marketId, marketId: b.marketId, asset: b.asset, intervalSec: b.intervalSec, expirySec: b.expirySec, side,
        heldRaw: side === "up" ? b.upRaw : b.downRaw, costBase: b.costBase - b.proceedsBase > 0n ? b.costBase - b.proceedsBase : 0n, decimals: b.decimals,
        entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? 0, tpBase: e?.tpBase ? BigInt(e.tpBase) : null, slBase: e?.slBase ? BigInt(e.slBase) : null,
      });
    }
    // A live Boost on a Window the screen knows (its asset and decimals come from the lane set).
    const markets = new Map((set?.lanes ?? []).flatMap((l) => l.markets.map((m) => [m.marketId.toLowerCase(), m] as const)));
    for (const b of boosts?.ok ? boosts.value : []) {
      const m = markets.get(b.marketId.toLowerCase());
      if (b.status !== "live" || !m || b.expirySec + 3_600 < nowSec) continue;
      const entryKey = `boost:${b.positionId}`;
      const e = entryOf(entries, entryKey, b.side);
      out.push({
        id: `b:${b.positionId}`, via: "boost", entryKey, marketId: b.marketId, asset: m.asset, intervalSec: m.intervalSec, expirySec: b.expirySec, side: b.side,
        heldRaw: b.quantityRaw, costBase: b.stakeBase, decimals: m.decimals, entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? b.openedAtSec * 1000,
        tpBase: e?.tpBase ? BigInt(e.tpBase) : null, slBase: e?.slBase ? BigInt(e.slBase) : null, boost: { positionId: b.positionId, frontedBase: b.frontedBase, leverageBps: b.leverageBps },
      });
    }
    return withFreshFills(out, fresh, (id) => markets.get(id.toLowerCase()) ?? null, Date.now());
  }, [wallet, vault, boosts, entries, set, fresh]);
}
