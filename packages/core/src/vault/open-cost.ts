/**
 * What a Trading Balance position's held contracts cost (D-227), per side, on the wallet ledger's rule (average cost: a
 * buy adds what it paid, a sale takes its share of the side's cost out pro rata). The vault's tally (`VaultTally`) keeps
 * one cost for both sides and no order, so it is exact alone only for a one-sided bet never sold from; otherwise the
 * vault's own `Executed` fills are replayed. Pure; base units in, base units out.
 */
import { soldShare } from "../projection/ledger";

/** The tally's buy and sell counts (`tallyOf`), what it paid in total, and what the vault holds now. */
export interface VaultTallyCounts {
  costBase: bigint;
  boughtUpRaw: bigint;
  boughtDownRaw: bigint;
  soldUpRaw: bigint;
  soldDownRaw: bigint;
}

/** One vault fill (`EventVault.Executed`): the side, buy or sell, the cash and the contracts it moved. */
export interface VaultFill {
  outcomeIdx: 0 | 1;
  isBuy: boolean;
  cashBase: bigint;
  tokenRaw: bigint;
}

export interface SideCosts {
  upBase: bigint;
  downBase: bigint;
}

/** Exact from the tally alone: one side bought and nothing sold, so every dollar paid is that side's. Null otherwise. */
export function tallyOpenCost(t: VaultTallyCounts): SideCosts | null {
  if (t.soldUpRaw > 0n || t.soldDownRaw > 0n) return null;
  if (t.boughtDownRaw === 0n) return { upBase: t.boughtUpRaw > 0n ? t.costBase : 0n, downBase: 0n };
  if (t.boughtUpRaw === 0n) return { upBase: 0n, downBase: t.costBase };
  return null;
}

/** The fills replayed oldest first, with what each side holds after them (to check the replay saw every fill). */
export function replayVaultCost(fills: readonly VaultFill[]): SideCosts & { upRaw: bigint; downRaw: bigint } {
  const cost = [0n, 0n];
  const held = [0n, 0n];
  for (const f of fills) {
    const i = f.outcomeIdx;
    if (f.isBuy) {
      cost[i]! += f.cashBase;
      held[i]! += f.tokenRaw;
      continue;
    }
    const sold = f.tokenRaw < held[i]! ? f.tokenRaw : held[i]!;
    cost[i]! -= soldShare(cost[i]!, sold, held[i]!);
    held[i]! -= sold;
  }
  return { upBase: cost[0]!, downBase: cost[1]!, upRaw: held[0]!, downRaw: held[1]! };
}

/**
 * The fallback when the fills can't be read: the tally's average over everything bought, per contract held. Exact for a
 * one-sided bet bought before any sale; a re-entry or a hedge is approximate (the pooled average of both sides).
 */
export function pooledOpenCost(t: VaultTallyCounts, held: { upRaw: bigint; downRaw: bigint }): SideCosts {
  const bought = t.boughtUpRaw + t.boughtDownRaw;
  if (bought === 0n) return { upBase: 0n, downBase: 0n };
  const share = (heldRaw: bigint, boughtRaw: bigint) => (heldRaw <= 0n ? 0n : heldRaw >= boughtRaw ? (t.costBase * boughtRaw) / bought : (t.costBase * heldRaw) / bought);
  return { upBase: share(held.upRaw, t.boughtUpRaw), downBase: share(held.downRaw, t.boughtDownRaw) };
}
