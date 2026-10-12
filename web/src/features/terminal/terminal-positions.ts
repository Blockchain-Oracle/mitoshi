"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/terminal-positions.ts — Mitoshi's three homes for a
// position: the wallet's own (the engine's balances, `usePositions`), the Trading Balance's (`useVaultBets`, held by
// the vault for its owner), a Boost (the LeverageReserve's, part fronted, S23d) and, signed out, DEMO's paper ones
// (`demo.ts`, D-223 — superseding D-191's "no paper positions"). D-227: every row carries the open cost of what it
// holds (the ledger's per side, the Trading Balance's average cost, a Boost's stake less what it paid back), and a
// Window held on both sides is one row per side, each at its own cost.
import type { Address, LaneSet, MarketId, Side } from "@cwf/core";
import { listLeveragePositionsOf } from "@cwf/markets/leverage";
import { usePositions, useReadingQuery, useVaultBets } from "@cwf/markets/react";
import { useMemo } from "react";
import { useDemoState } from "./demo";
import { entryOf, useEntries } from "./entries";
import { useFreshFills, withFreshFills } from "./fresh-fills";

/** The Boost reads' cache keys: shared with `/portfolio`'s Boost list, so a close here refreshes both. */
export const BOOST_KEYS = ["cwf", "boost"] as const;

/** One open position on the screen, in either home, with what the chart needs. */
export interface TerminalPosition {
  id: string;
  /** Where it is held: the wallet itself, the Trading Balance (the vault's sell lane, 23d), a Boost (the reserve's), or DEMO paper. */
  via: "wallet" | "vault" | "boost" | "paper";
  /** The key of this position's entry record (Entry line, trail, TP/SL): its Window, or its Boost. */
  entryKey: string;
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  side: Side;
  heldRaw: bigint;
  /** The open cost of what is held (D-227): average cost, a sale's share taken out; a Boost's stake less what it paid back. */
  costBase: bigint;
  /**
   * The Window's realised P&L so far (its sales, at average cost) and the cost they took out; on the Window's first row
   * only, so a sum counts each once.
   */
  realizedBase: bigint;
  realizedCostBase?: bigint;
  /** The indexed fills haven't caught up with the balance: no cost yet ("Updating", no P&L). */
  costStale?: boolean;
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
  /**
   * A Boost: its id, the reserve's claim repaid first out of a sale, the multiple, what the owner staked, what the reserve
   * paid back so far (a partial close), and the price a contract it opened at (Avg in).
   */
  boost?: { positionId: bigint; frontedBase: bigint; leverageBps: number; stakeBase: bigint; returnedBase: bigint; entryPriceRaw: bigint };
}

/** The held sides of one Window, each with its open cost: one row per side (D-227), the larger side first. */
function heldSides(upRaw: bigint, downRaw: bigint, upCost: bigint, downCost: bigint): Array<{ side: Side; heldRaw: bigint; costBase: bigint }> {
  const rows = [
    { side: "up" as const, heldRaw: upRaw, costBase: upCost },
    { side: "down" as const, heldRaw: downRaw, costBase: downCost },
  ].filter((r) => r.heldRaw > 0n);
  return rows.sort((a, b) => (b.heldRaw > a.heldRaw ? 1 : b.heldRaw < a.heldRaw ? -1 : 0));
}

export function useTerminalPositions(address: Address | null, set: LaneSet | null): TerminalPosition[] {
  const wallet = usePositions(address);
  const vault = useVaultBets(address);
  const boosts = useReadingQuery([...BOOST_KEYS, "positions", address ?? ""], () => listLeveragePositionsOf(address!), { enabled: address !== null, pollMs: 10_000 });
  const entries = useEntries();
  const fresh = useFreshFills();
  const demo = useDemoState();
  return useMemo(() => {
    const out: TerminalPosition[] = [];
    // Signed out: DEMO's paper positions, the only ones there are.
    if (address === null) {
      for (const p of demo.positions) {
        const e = entryOf(entries, p.marketId, p.side);
        out.push({
          id: `p:${p.id}`, via: "paper", entryKey: p.marketId, marketId: p.marketId as MarketId, asset: p.asset, intervalSec: p.intervalSec, expirySec: p.expirySec, side: p.side,
          heldRaw: BigInt(p.contractsRaw), costBase: BigInt(p.costBase), realizedBase: 0n, decimals: 6, entrySpot: p.entrySpot || null, trailStop: e?.trailStop ?? null, openedAtMs: p.openedAtMs, tpBase: null, slBase: null,
        });
      }
      return out;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    for (const r of wallet?.ok ? wallet.value : []) {
      heldSides(r.balanceUpRaw, r.balanceDownRaw, r.costUpBase, r.costDownBase).forEach(({ side, heldRaw, costBase }, i) => {
        const e = entryOf(entries, r.marketId, side);
        out.push({
          id: `w:${r.marketId}:${side}`, via: "wallet", entryKey: r.marketId, marketId: r.marketId, asset: r.asset, intervalSec: r.intervalSec, expirySec: r.expirySec, side,
          heldRaw, costBase, realizedBase: i === 0 ? r.realizedPnlBase : 0n, realizedCostBase: i === 0 ? r.soldCostBase : 0n, costStale: r.costStale || undefined, decimals: r.decimals,
          entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? 0, tpBase: e?.tpBase ? BigInt(e.tpBase) : null, slBase: e?.slBase ? BigInt(e.slBase) : null,
        });
      });
    }
    for (const b of vault?.ok ? vault.value : []) {
      if (b.state !== "open" || (b.upRaw === 0n && b.downRaw === 0n) || b.expirySec + 3_600 < nowSec) continue;
      // Realised so far: what its sales took, less the open cost they carried out (average cost).
      const soldCost = b.costBase - b.costUpBase - b.costDownBase;
      const realized = b.proceedsBase - soldCost;
      heldSides(b.upRaw, b.downRaw, b.costUpBase, b.costDownBase).forEach(({ side, heldRaw, costBase }, i) => {
        const e = entryOf(entries, b.marketId, side);
        out.push({
          id: `v:${b.vault}:${b.marketId}:${side}`, via: "vault", vault: b.vault, entryKey: b.marketId, marketId: b.marketId, asset: b.asset, intervalSec: b.intervalSec, expirySec: b.expirySec, side,
          heldRaw, costBase, realizedBase: i === 0 ? realized : 0n, realizedCostBase: i === 0 ? soldCost : 0n, decimals: b.decimals,
          entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? 0, tpBase: e?.tpBase ? BigInt(e.tpBase) : null, slBase: e?.slBase ? BigInt(e.slBase) : null,
        });
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
        // D-227: a partial close paid `returned` back and kept the rest live, so what is still in is the stake less it.
        heldRaw: b.quantityRaw, costBase: b.stakeBase - b.returnedBase, realizedBase: 0n, decimals: m.decimals, entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? b.openedAtSec * 1000,
        tpBase: e?.tpBase ? BigInt(e.tpBase) : null, slBase: e?.slBase ? BigInt(e.slBase) : null,
        boost: { positionId: b.positionId, frontedBase: b.frontedBase, leverageBps: b.leverageBps, stakeBase: b.stakeBase, returnedBase: b.returnedBase, entryPriceRaw: b.entryPriceRaw },
      });
    }
    return withFreshFills(out, fresh, (id) => markets.get(id.toLowerCase()) ?? null, Date.now());
  }, [address, demo, wallet, vault, boosts, entries, set, fresh]);
}
