/**
 * The recount's work list (R6, D-230), pure. History is cut into tiles on a fixed grid (`tileBlocks`, 20,000 blocks,
 * about 3.4 h of Moderato); each tile keeps what has been compared in it — the range, the contracts, and the blocks
 * the index lacked at the time. A pass then asks only for what is new:
 *
 *  - `new`       a tile never compared: every contract deployed by its end, over the tile's held segments
 *  - `extend`    the head tile's blocks since the last pass
 *  - `refill`    blocks that were gaps and the index now holds (its backfill caught up): compared for the tile's contracts
 *  - `backfill`  a contract added to the manifest after its tile was compared, or a tile that must start earlier
 *
 * Each item compares the segments of its range the index holds now and records the rest as the tile's gaps, so
 * nothing the index lacks is ever counted as compared, and nothing it later backfills is left unchecked.
 */
import { blockCount, clipRanges, heldSegments, normalizeRanges, subtractRanges, type BlockRange } from "./ranges";

/** What has been compared in one tile. */
export interface TileState {
  /** Grid key: the tile's first block (a multiple of `tileBlocks`). */
  tileFrom: bigint;
  /** First and last block compared (inside the tile). */
  from: bigint;
  to: bigint;
  /** Contracts compared over `[from, to]`, lowercased. */
  addresses: string[];
  /** Blocks in `[from, to]` the index lacked when compared and that are not compared yet. */
  gaps: BlockRange[];
}

export type RecountItemKind = "new" | "extend" | "refill" | "backfill";

export interface RecountItem {
  kind: RecountItemKind;
  tileFrom: bigint;
  from: bigint;
  to: bigint;
  /** The blocks to compare: held by the index now. */
  segments: BlockRange[];
  /** The index's gaps in `[from, to]`, recorded on the tile (empty for a refill: the tile keeps what is still a gap). */
  skipped: BlockRange[];
  /** Contracts to compare, lowercased. */
  addresses: string[];
  /** Contracts the tile counts as compared once this item lands. */
  adds: string[];
}

export interface PlanSource {
  address: string;
  deployBlock: bigint;
}

export interface PlanInput {
  sources: readonly PlanSource[];
  /** Last block to compare (closed: below the index's head and the chain's). */
  top: bigint;
  tileBlocks: bigint;
  tiles: readonly TileState[];
  /** The index's gaps now. */
  gaps: readonly BlockRange[];
}

export const DEFAULT_TILE_BLOCKS = 20_000n;

const lower = (a: string) => a.toLowerCase();
const tileOf = (block: bigint, size: bigint) => (block / size) * size;

/** The first block any source can have logs at; null without sources. */
export function domainStart(sources: readonly PlanSource[]): bigint | null {
  return sources.reduce<bigint | null>((m, s) => (m === null || s.deployBlock < m ? s.deployBlock : m), null);
}

/** Head tile first (the newest blocks every pass), then refills (cheap), then the rest oldest first. */
function order(items: RecountItem[], headTile: bigint): RecountItem[] {
  const rank = (i: RecountItem) => (i.tileFrom === headTile ? 0 : i.kind === "refill" ? 1 : 2);
  return items.sort((a, b) => rank(a) - rank(b) || (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

export function planRecount(input: PlanInput): RecountItem[] {
  const start = domainStart(input.sources);
  if (start === null || input.top < start) return [];
  const size = input.tileBlocks;
  const gaps = normalizeRanges(input.gaps);
  const byTile = new Map(input.tiles.map((t) => [t.tileFrom, t]));
  const deployed = (by: bigint) => input.sources.filter((s) => s.deployBlock <= by).map((s) => lower(s.address));
  const items: RecountItem[] = [];
  const span = (kind: RecountItemKind, tileFrom: bigint, from: bigint, to: bigint, addresses: string[], adds: string[]) => {
    if (to < from || !addresses.length) return;
    items.push({ kind, tileFrom, from, to, segments: heldSegments(from, to, gaps), skipped: clipRanges(gaps, from, to), addresses, adds });
  };
  const headTile = tileOf(input.top, size);
  for (let tileFrom = tileOf(start, size); tileFrom <= input.top; tileFrom += size) {
    const lo = tileFrom > start ? tileFrom : start;
    const end = tileFrom + size - 1n < input.top ? tileFrom + size - 1n : input.top;
    const want = deployed(end);
    const state = byTile.get(tileFrom);
    if (!state) {
      span("new", tileFrom, lo, end, want, want);
      continue;
    }
    const known = new Set(state.addresses);
    // The manifest gained a contract deployed earlier than the tile's compared range starts.
    if (lo < state.from) span("backfill", tileFrom, lo, state.from - 1n, deployed(state.from - 1n), []);
    const missing = deployed(state.to).filter((a) => !known.has(a));
    if (missing.length) span("backfill", tileFrom, state.from, state.to, missing, missing);
    const refilled = subtractRanges(state.gaps, gaps);
    if (refilled.length && state.addresses.length) {
      items.push({ kind: "refill", tileFrom, from: refilled[0]!.from, to: refilled[refilled.length - 1]!.to, segments: refilled, skipped: [], addresses: [...state.addresses], adds: [] });
    }
    if (state.to < end) span("extend", tileFrom, state.to + 1n, end, want, want.filter((a) => !known.has(a) && !missing.includes(a)));
  }
  return order(items, headTile);
}

/** The tile after `item` is compared (its counts matched). */
export function applyItem(state: TileState | undefined, item: RecountItem): TileState {
  if (!state) return { tileFrom: item.tileFrom, from: item.from, to: item.to, addresses: [...new Set(item.adds)], gaps: normalizeRanges(item.skipped) };
  const addresses = [...new Set([...state.addresses, ...item.adds])];
  if (item.kind === "refill") return { ...state, addresses, gaps: subtractRanges(state.gaps, item.segments) };
  return {
    tileFrom: state.tileFrom,
    from: item.from < state.from ? item.from : state.from,
    to: item.to > state.to ? item.to : state.to,
    addresses,
    gaps: normalizeRanges([...state.gaps, ...item.skipped]),
  };
}

/** Blocks compared so far across tiles (ranges minus what was skipped). */
export function comparedBlocks(tiles: readonly TileState[]): bigint {
  return tiles.reduce((n, t) => n + (t.to - t.from + 1n) - blockCount(t.gaps), 0n);
}
