/**
 * Inclusive block ranges for the recount (R6, D-230): the hosted Tempo index skips blocks (measured 2026-10-13: 92 gaps,
 * 20,364 blocks between 38.71M and 39.44M on Moderato), so the recount compares the segments the index holds and
 * reports the rest. Pure: no I/O.
 */

/** Blocks `from` through `to`, both included. */
export interface BlockRange {
  from: bigint;
  to: bigint;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

/** Sorted, with empty ranges dropped and overlapping or touching ranges merged. */
export function normalizeRanges(ranges: readonly BlockRange[]): BlockRange[] {
  const sorted = ranges.filter((r) => r.to >= r.from).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const out: BlockRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to + 1n) last.to = max(last.to, r.to);
    else out.push({ from: r.from, to: r.to });
  }
  return out;
}

/** The parts of `ranges` inside `[from, to]`. */
export function clipRanges(ranges: readonly BlockRange[], from: bigint, to: bigint): BlockRange[] {
  return normalizeRanges(ranges.map((r) => ({ from: max(r.from, from), to: min(r.to, to) })));
}

/** The blocks of `base` that are not in `cut`. */
export function subtractRanges(base: readonly BlockRange[], cut: readonly BlockRange[]): BlockRange[] {
  const holes = normalizeRanges(cut);
  const out: BlockRange[] = [];
  for (const r of normalizeRanges(base)) {
    let from = r.from;
    for (const h of holes) {
      if (h.to < from) continue;
      if (h.from > r.to) break;
      if (h.from > from) out.push({ from, to: h.from - 1n });
      from = h.to + 1n;
      if (from > r.to) break;
    }
    if (from <= r.to) out.push({ from, to: r.to });
  }
  return out;
}

/** The blocks in both. */
export function intersectRanges(a: readonly BlockRange[], b: readonly BlockRange[]): BlockRange[] {
  const out: BlockRange[] = [];
  for (const r of normalizeRanges(b)) out.push(...clipRanges(a, r.from, r.to));
  return normalizeRanges(out);
}

/** How many blocks the ranges hold (after merging). */
export function blockCount(ranges: readonly BlockRange[]): bigint {
  return normalizeRanges(ranges).reduce((n, r) => n + (r.to - r.from + 1n), 0n);
}

/** `[from, to]` without the index's gaps: the segments a recount may compare. */
export const heldSegments = (from: bigint, to: bigint, gaps: readonly BlockRange[]): BlockRange[] => (to < from ? [] : subtractRanges([{ from, to }], gaps));

/** Whether `block` is in `ranges` (normalized: sorted, merged). Binary search. */
export function inRanges(ranges: readonly BlockRange[], block: bigint): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid]!;
    if (block < r.from) hi = mid - 1;
    else if (block > r.to) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Ranges whose holes are under `joinBlocks` merged into one span: one log walk per span instead of one per segment. */
export function walkSpans(ranges: readonly BlockRange[], joinBlocks: bigint): BlockRange[] {
  const out: BlockRange[] = [];
  for (const r of normalizeRanges(ranges)) {
    const last = out[out.length - 1];
    if (last && r.from - last.to - 1n < joinBlocks) last.to = r.to;
    else out.push({ ...r });
  }
  return out;
}

/** At most `size` ranges per chunk, so a SQL predicate stays a sane URL length. */
export function chunkRanges(ranges: readonly BlockRange[], size: number): BlockRange[][] {
  const out: BlockRange[][] = [];
  for (let i = 0; i < ranges.length; i += size) out.push(ranges.slice(i, i + size));
  return out;
}

/** `38712662–38732071`, or one number for a single block. */
export const formatRange = (r: BlockRange): string => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`);

/** The largest range (the first one on a tie), or null. */
export function largestRange(ranges: readonly BlockRange[]): BlockRange | null {
  let best: BlockRange | null = null;
  for (const r of ranges) if (!best || r.to - r.from > best.to - best.from) best = r;
  return best;
}
