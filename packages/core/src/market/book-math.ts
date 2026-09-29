// Ported from Agari 03b30ab:packages/core/src/market/book-math.ts
/**
 * Book walks, mirrored from `agari-common::book_walk` (events-engine.md §9) with identical results on the shared
 * vectors (`anchor/tests/vectors/book.vectors.json`). Pure bigint math over a decoded Book side: walks traverse the
 * FIFO nodes (never `live_lots` alone) and count only live, unexpired, and (when asked) rested orders (PD-2).
 * Erasable TypeScript only, so Node can run it directly for the vector generator.
 */

const PAIR_TICKS = 1000;
const MIN_PRICE = 1;
const MAX_PRICE = 999;
const U64_MAX = (1n << 64n) - 1n;

export const DEFAULT_SLIPPAGE_BPS = 300;
export const DEFAULT_SLIPPAGE_MIN_TICKS = 10;

export interface WalkNode {
  lots: bigint;
  expireTs: bigint;
  placedSlot: bigint;
  live: boolean;
  /** 1-based ref of the next (newer) node at the same price; 0 = end. */
  next: number;
}

/** One Book side: bitmap words (bit `p` = level `p` has a node), each level's 1-based head ref by price, the nodes. */
export interface BookSideView {
  bits: readonly bigint[];
  heads: readonly number[];
  nodes: readonly WalkNode[];
}

export interface NodeFilter {
  now: bigint;
  slot: bigint;
  restedOnly: boolean;
  minRestSlots: bigint;
}

/** `[priceTicks, lots]`, best first. */
export type BookLevel = readonly [number, bigint];

export type TakerKind = "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO";

const saturatingAdd = (a: bigint, b: bigint): bigint => (a + b > U64_MAX ? U64_MAX : a + b);

export function admitsNode(filter: NodeFilter, node: WalkNode): boolean {
  return node.live && node.expireTs > filter.now && (!filter.restedOnly || saturatingAdd(node.placedSlot, filter.minRestSlots) <= filter.slot);
}

function bitSet(bits: readonly bigint[], price: number): boolean {
  const word = bits[Math.floor(price / 64)] ?? 0n;
  return ((word >> BigInt(price % 64)) & 1n) === 1n;
}

/** Filtered lots at one price; a corrupt ref or cycle ends the walk after at most `nodes.length` steps. */
function levelLots(side: BookSideView, price: number, filter: NodeFilter): bigint {
  let total = 0n;
  let ref = side.heads[price] ?? 0;
  for (let step = 0; step < side.nodes.length; step += 1) {
    const node = ref >= 1 ? side.nodes[ref - 1] : undefined;
    if (!node) break;
    if (admitsNode(filter, node)) total = saturatingAdd(total, node.lots);
    ref = node.next;
  }
  return total;
}

/** Up to `n` non-empty filtered levels, best first: bids descending, asks ascending. */
export function bookLevels(side: BookSideView, dir: "bid" | "ask", n: number, filter: NodeFilter): BookLevel[] {
  const out: BookLevel[] = [];
  const visit = (price: number) => {
    if (!bitSet(side.bits, price)) return;
    const lots = levelLots(side, price, filter);
    if (lots > 0n) out.push([price, lots]);
  };
  if (dir === "bid") {
    for (let price = MAX_PRICE; price >= MIN_PRICE && out.length < n; price -= 1) visit(price);
  } else {
    for (let price = MIN_PRICE; price <= MAX_PRICE && out.length < n; price += 1) visit(price);
  }
  return out;
}

export function topOfBook(bids: BookSideView, asks: BookSideView, filter: NodeFilter): { bid: BookLevel | null; ask: BookLevel | null } {
  return { bid: bookLevels(bids, "bid", 1, filter)[0] ?? null, ask: bookLevels(asks, "ask", 1, filter)[0] ?? null };
}

/** The levels a taker crosses in its own outcome's terms: BUY_NO takes bids as `1000 − p`, SELL_NO hits asks as `1000 − p`. */
export function outcomeLevels(kind: TakerKind, bids: BookSideView, asks: BookSideView, n: number, filter: NodeFilter): BookLevel[] {
  const invert = (levels: BookLevel[]): BookLevel[] => levels.map(([p, q]) => [PAIR_TICKS - p, q] as const);
  switch (kind) {
    case "BUY_YES":
      return bookLevels(asks, "ask", n, filter);
    case "SELL_YES":
      return bookLevels(bids, "bid", n, filter);
    case "BUY_NO":
      return invert(bookLevels(bids, "bid", n, filter));
    case "SELL_NO":
      return invert(bookLevels(asks, "ask", n, filter));
  }
}

/** `⌈Σ take × price / filled⌉` over the first `lots`; zeros when nothing fills (cost rounded up, `ParlayMath.vwap`). */
export function vwapOverDepth(levels: readonly BookLevel[], lots: bigint): { vwapTicks: bigint; filled: bigint } {
  let cost = 0n;
  let filled = 0n;
  for (const [price, available] of levels) {
    if (filled >= lots) break;
    const take = available < lots - filled ? available : lots - filled;
    cost += take * BigInt(price);
    filled += take;
  }
  if (filled === 0n) return { vwapTicks: 0n, filled: 0n };
  return { vwapTicks: (cost + filled - 1n) / filled, filled };
}

/** `Σ take × price` for selling up to `lots` into these levels, exact (ticks × lots). */
export function exitWalk(levels: readonly BookLevel[], lots: bigint): { proceeds: bigint; filled: bigint } {
  let proceeds = 0n;
  let filled = 0n;
  for (const [price, available] of levels) {
    if (filled >= lots) break;
    const take = available < lots - filled ? available : lots - filled;
    proceeds += take * BigInt(price);
    filled += take;
  }
  return { proceeds, filled };
}

export interface StakeQuote {
  /** Protective limit in the bought outcome's own terms. */
  limitTicks: number;
  /** The same limit in YES terms, what the order takes. */
  yesPriceTicks: number;
  lots: bigint;
  /** `lots × limitTicks × cu`, never above the stake. */
  escrowCash: bigint;
}

/** Port of `quoteBinaryStakeOverBook` on the Agari grid (`tick = lot = 1`, `one = 1000`). Null when nothing fits. */
export function quoteStake(
  levels: readonly BookLevel[],
  side: "BUY_YES" | "BUY_NO",
  stakeCash: bigint,
  cashUnit: bigint,
  minLots: bigint,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
  minTicks: number = DEFAULT_SLIPPAGE_MIN_TICKS,
): StakeQuote | null {
  if (stakeCash <= 0n || cashUnit <= 0n) return null;
  let taken = 0n;
  let limit = 0;
  for (const [price, available] of levels) {
    if (price <= 0 || price >= PAIR_TICKS || available <= 0n) continue;
    const maxLots = stakeCash / (BigInt(price) * cashUnit);
    if (maxLots <= taken) break;
    const take = available < maxLots - taken ? available : maxLots - taken;
    taken += take;
    limit = price;
    if (take < available) break;
  }
  if (taken === 0n) return null;
  const percent = Math.floor((limit * slippageBps) / 10_000);
  const padded = Math.min(MAX_PRICE, limit + Math.max(percent, minTicks));
  const affordable = stakeCash / (BigInt(padded) * cashUnit);
  const lots = affordable < taken ? affordable : taken;
  if (lots === 0n || lots < minLots) return null;
  return { limitTicks: padded, yesPriceTicks: side === "BUY_YES" ? padded : PAIR_TICKS - padded, lots, escrowCash: lots * BigInt(padded) * cashUnit };
}
