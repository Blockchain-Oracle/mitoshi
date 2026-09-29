/**
 * Pure quote kernels over the lens's YES-terms levels (plan C.2.2 `freshQuoteStake` / `freshExitQuote` / `getBookDepth`):
 * the Agari book walks (`@cwf/core` `quoteStake`, `exitWalk`, protective limit 300 bps / 10 ticks) mapped onto the
 * Masayume `Quote`/`BookDepth` shapes. One kernel for the composing ticket and the click-time requote, so the two can
 * never disagree. Units: `contractsRaw = lots × lotBase`, cost `= lots × ownTicks × cashUnit`, a winning contract pays
 * one collateral unit (`1000 × cashUnit == lotBase`, engine Grid), so `payoutIfRight = contractsRaw`.
 * Replaces Masayume 68f7a09:packages/markets/src/provider/quotes.ts (SDK `quoteBinaryStakeOverBook`).
 */
import { DEFAULT_SLIPPAGE_BPS, DEFAULT_SLIPPAGE_MIN_TICKS, exitWalk, quoteStake, type BookDepth, type BookLevel, type BookLevelView, type ExitQuote, type Quote, type Side } from "@cwf/core";
import { PAIR_TICKS } from "./calls";

/** One side of the book in YES terms, best first: bids descending, asks ascending (lens `levels`). */
export interface YesBook {
  bids: readonly BookLevel[];
  asks: readonly BookLevel[];
}

export interface Grid {
  lotBase: bigint;
  tickBase: bigint;
  cashUnit: bigint;
  minLots: bigint;
  decimals: number;
}

const invert = (levels: readonly BookLevel[]): BookLevel[] => levels.map(([p, q]) => [PAIR_TICKS - p, q] as const);

/** The levels a BUY of `side` takes, in its own terms (Up takes YES asks; Down takes YES bids as `1000 − p`). */
export function buyLevels(book: YesBook, side: Side): BookLevel[] {
  return side === "up" ? [...book.asks] : invert(book.bids);
}

/** The levels a SELL of `side` hits, in its own terms (Up hits YES bids; Down hits YES asks as `1000 − p`). */
export function sellLevels(book: YesBook, side: Side): BookLevel[] {
  return side === "up" ? [...book.bids] : invert(book.asks);
}

const bpsOfTicks = (ticks: bigint | number) => Number(BigInt(ticks) * 10n);

/** What `stakeBase` buys of `side` right now; null when nothing fills or the size is below the Series minimum. */
export function quoteFromBook(book: YesBook, grid: Grid, side: Side, stakeBase: bigint, nowMs: number, feeBps = 0): Quote | null {
  const levels = buyLevels(book, side);
  const q = quoteStake(levels, side === "up" ? "BUY_YES" : "BUY_NO", stakeBase, grid.cashUnit, grid.minLots, DEFAULT_SLIPPAGE_BPS, DEFAULT_SLIPPAGE_MIN_TICKS);
  if (!q) return null;
  // Expected cost: the walk's exact cost for `lots` at the levels (what fills now), ≤ the escrow at the limit.
  const walked = exitWalk(levels, q.lots);
  const expectedCostBase = walked.proceeds * grid.cashUnit;
  const contractsRaw = q.lots * grid.lotBase;
  const avgPriceBps = bpsOfTicks((walked.proceeds + q.lots - 1n) / q.lots);
  // Partial: the book ran out before the stake did (every listed lot taken, and the stake affords more at the limit).
  const available = levels.reduce((sum, [, lots]) => sum + lots, 0n);
  const partial = q.lots >= available && stakeBase / (BigInt(q.limitTicks) * grid.cashUnit) > q.lots;
  const fillableStakeBase = partial ? q.escrowCash : stakeBase;
  return {
    side,
    stakeBase,
    contractsRaw,
    expectedCostBase,
    maxCostBase: q.escrowCash,
    limitPriceRaw: BigInt(q.yesPriceTicks) * grid.tickBase,
    avgPriceBps,
    oddsCents: Math.round(avgPriceBps / 100),
    payoutIfRightBase: contractsRaw,
    fillableStakeBase,
    partial,
    feeBps,
    decimals: grid.decimals,
    quotedAtMs: nowMs,
  };
}

/** Own-terms limit ticks of a quote (the order lane sends this; the engine converts nothing). */
export function ownLimitTicksOf(quote: Pick<Quote, "side" | "limitPriceRaw">, grid: Pick<Grid, "tickBase">): number {
  const yes = Number(quote.limitPriceRaw / grid.tickBase);
  return quote.side === "up" ? yes : PAIR_TICKS - yes;
}

/**
 * Selling up to `heldLots` of `side` now (Agari `exitQuoteFromBook`, D-067): `lots = min(held, fillable)`, the limit is
 * the last level reached padded down by `max(⌊p × 3%⌋, 10)` ticks (floored at 1); `minProceeds` is what a fill at that
 * limit pays at least. Null when nothing fills or the size is below the Series minimum.
 */
export function exitFromBook(book: YesBook, grid: Grid, side: Side, heldLots: bigint, nowMs: number): ExitQuote | null {
  if (heldLots <= 0n) return null;
  const levels = sellLevels(book, side);
  const { proceeds, filled } = exitWalk(levels, heldLots);
  const lots = filled < heldLots ? filled : heldLots;
  if (lots === 0n || lots < grid.minLots) return null;
  let reached = 0;
  let taken = 0n;
  for (const [price, available] of levels) {
    if (taken >= lots) break;
    taken += available;
    reached = price;
  }
  const padding = Math.max(Math.floor((reached * DEFAULT_SLIPPAGE_BPS) / 10_000), DEFAULT_SLIPPAGE_MIN_TICKS);
  const limitOwn = Math.max(reached - padding, 1);
  return {
    side,
    contractsRaw: lots * grid.lotBase,
    proceedsBase: proceeds * grid.cashUnit,
    minProceedsBase: lots * BigInt(limitOwn) * grid.cashUnit,
    limitPriceTicks: limitOwn,
    fillableContractsRaw: filled * grid.lotBase,
    partial: filled < heldLots,
    quotedAtMs: nowMs,
  };
}

const view = (grid: Grid) => ([ticks, lots]: BookLevel): BookLevelView => ({ priceRaw: BigInt(ticks) * grid.tickBase, priceBps: bpsOfTicks(ticks), quantityRaw: lots * grid.lotBase });

/** Up/Down depth, each column in its own terms ("what you pay"): Down asks are YES bids inverted, Down bids YES asks inverted. */
export function depthFromBook(book: YesBook, grid: Grid): BookDepth {
  const v = view(grid);
  return {
    upBids: book.bids.map(v),
    upAsks: book.asks.map(v),
    downBids: invert(book.asks).map(v),
    downAsks: invert(book.bids).map(v),
    decimals: grid.decimals,
  };
}
