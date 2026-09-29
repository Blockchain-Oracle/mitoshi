// Ported from Agari 03b30ab:packages/core/src/orders/resting-quote.ts
/**
 * A pre-open call's quote (D-088): a post-only order at the user's own price, sized from the stake on the Series grid.
 * Pure integer math, mirroring `matching/paths.rs::cash_of`: a resting buy escrows `lots × own_ticks × cash_unit`, where
 * a YES kind's own ticks are the YES price and a NO kind's are `1000 − p`. UP at c¢ is BUY_YES at `c × 10` ticks; DOWN
 * at c¢ is BUY_NO at `1000 − c × 10` in YES terms, so both escrow `c × 10` ticks per lot. It returns the same `Quote`
 * shape a taker's walk does, so funding, the order build and the CTA read it unchanged.
 */
import type { Side } from "../types/market";
import type { Quote } from "../types/trading";

export const PAIR_TICKS = 1000;
export const TICKS_PER_CENT = 10;
/** The venue's `MAX_OPEN_ORDERS_PER_SEAT` (events-instructions.md §3.1 step 10). */
export const MAX_RESTING_PER_SEAT = 16;

/** The Series grid a resting call is sized on (a structural subset of the runtime's `SeriesFacts`). */
export interface RestingGrid {
  lotBase: bigint;
  tickBase: bigint;
  cashUnit: bigint;
  minLots: bigint;
}

export interface RestingQuoteInput {
  side: Side;
  /** The user's price for their own side, in cents (1..99). */
  priceCents: number;
  stakeBase: bigint;
  grid: RestingGrid;
  decimals: number;
  quotedAtMs: number;
}

export type RestingBlocker = "no-price" | "no-stake" | "too-small";

export interface RestingSizing {
  /** Ticks one lot costs on the user's own side: `priceCents × 10`. */
  ownTicks: number;
  /** The same price in YES terms, what `user_place_order` takes. */
  yesTicks: number;
  lots: bigint;
  /** `lots × ownTicks × cashUnit`: the escrow, and the whole cost since a post-only fills at its own price. */
  escrowBase: bigint;
  /** The least stake that buys `minLots` at this price. */
  minStakeBase: bigint;
}

export type RestingQuote = { ok: true; quote: Quote; sizing: RestingSizing } | { ok: false; blocker: RestingBlocker; sizing: RestingSizing | null };

export const isPriceCents = (cents: number): boolean => Number.isInteger(cents) && cents >= 1 && cents <= 99;

/** Own-side cents → YES ticks: UP keeps its price, DOWN rests on the other side of the pair. */
export function yesTicksOf(side: Side, priceCents: number): number {
  const own = priceCents * TICKS_PER_CENT;
  return side === "up" ? own : PAIR_TICKS - own;
}

/** YES ticks → own-side cents for `side`. */
export function ownCentsOf(side: Side, yesTicks: number): number {
  return (side === "up" ? yesTicks : PAIR_TICKS - yesTicks) / TICKS_PER_CENT;
}

/** How many lots a stake rests at a price, and what they escrow (`⌊stake / (ownTicks × cu)⌋`). */
export function restingSizing(side: Side, priceCents: number, stakeBase: bigint, grid: RestingGrid): RestingSizing {
  const ownTicks = priceCents * TICKS_PER_CENT;
  const perLot = BigInt(ownTicks) * grid.cashUnit;
  const lots = perLot > 0n ? stakeBase / perLot : 0n;
  return { ownTicks, yesTicks: yesTicksOf(side, priceCents), lots, escrowBase: lots * perLot, minStakeBase: grid.minLots * perLot };
}

export function restingQuote(input: RestingQuoteInput): RestingQuote {
  const { side, priceCents, stakeBase, grid, decimals, quotedAtMs } = input;
  if (!isPriceCents(priceCents)) return { ok: false, blocker: "no-price", sizing: null };
  const sizing = restingSizing(side, priceCents, stakeBase, grid);
  if (stakeBase <= 0n) return { ok: false, blocker: "no-stake", sizing };
  if (sizing.lots < grid.minLots) return { ok: false, blocker: "too-small", sizing };
  const contractsRaw = sizing.lots * grid.lotBase;
  const avgPriceBps = sizing.ownTicks * TICKS_PER_CENT;
  return {
    ok: true,
    sizing,
    quote: {
      side,
      stakeBase,
      contractsRaw,
      expectedCostBase: sizing.escrowBase,
      maxCostBase: sizing.escrowBase,
      limitPriceRaw: BigInt(sizing.yesTicks) * grid.tickBase,
      avgPriceBps,
      oddsCents: priceCents,
      payoutIfRightBase: contractsRaw,
      // The stake past a whole lot is never held; nothing here is a partial fill.
      fillableStakeBase: sizing.escrowBase,
      partial: false,
      feeBps: 0,
      decimals,
      quotedAtMs,
    },
  };
}
