"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/terminal-positions.ts — Mitoshi's two homes for a
// position: the wallet's own (the engine's balances, `usePositions`) and the Trading Balance's (`useVaultBets`, held by
// the vault for its owner). No paper positions (D-191).
import type { Address, MarketId, Side } from "@cwf/core";
import { usePositions, useVaultBets } from "@cwf/markets/react";
import { useMemo } from "react";
import { entryOf, useEntries } from "./entries";

/** One open position on the screen, in either home, with what the chart needs. */
export interface TerminalPosition {
  id: string;
  /** Where it is held: the wallet itself, or the Trading Balance (sold through the vault's sell lane, 23d). */
  via: "wallet" | "vault";
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
  openedAtMs: number;
}

export function useTerminalPositions(address: Address | null): TerminalPosition[] {
  const wallet = usePositions(address);
  const vault = useVaultBets(address);
  const entries = useEntries();
  return useMemo(() => {
    const out: TerminalPosition[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    for (const r of wallet?.ok ? wallet.value : []) {
      if (r.balanceUpRaw === 0n && r.balanceDownRaw === 0n) continue;
      const side: Side = r.balanceUpRaw >= r.balanceDownRaw ? "up" : "down";
      const e = entryOf(entries, r.marketId, side);
      out.push({
        id: `w:${r.marketId}`, via: "wallet", marketId: r.marketId, asset: r.asset, intervalSec: r.intervalSec, expirySec: r.expirySec, side,
        heldRaw: side === "up" ? r.balanceUpRaw : r.balanceDownRaw, costBase: r.costBasisBase, decimals: r.decimals,
        entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? 0,
      });
    }
    for (const b of vault?.ok ? vault.value : []) {
      if (b.state !== "open" || (b.upRaw === 0n && b.downRaw === 0n) || b.expirySec + 3_600 < nowSec) continue;
      const side: Side = b.upRaw >= b.downRaw ? "up" : "down";
      const e = entryOf(entries, b.marketId, side);
      out.push({
        id: `v:${b.marketId}`, via: "vault", marketId: b.marketId, asset: b.asset, intervalSec: b.intervalSec, expirySec: b.expirySec, side,
        heldRaw: side === "up" ? b.upRaw : b.downRaw, costBase: b.costBase - b.proceedsBase > 0n ? b.costBase - b.proceedsBase : 0n, decimals: b.decimals,
        entrySpot: e?.spot || null, trailStop: e?.trailStop ?? null, openedAtMs: e?.atMs ?? 0,
      });
    }
    return out.sort((a, b) => a.expirySec - b.expirySec);
  }, [wallet, vault, entries]);
}
