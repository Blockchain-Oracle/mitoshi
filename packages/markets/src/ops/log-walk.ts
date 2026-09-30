/**
 * `eth_getLogs` over a long range in windows the RPC accepts. Moderato refuses a window holding more than 20,000 logs
 * with `-32602 "query exceeds max results 20000, retry with the range A-B"` (measured 2026-09-30): the walk retries with
 * the range the RPC names, halves when an error names none, and doubles again after every answered window — the ops
 * indexer's window rule (`services/ops/src/actors/indexer/window.ts`) plus the RPC's own hint (D-187).
 */

export interface LogWalkOptions {
  /** First window, in blocks (default 50,000). */
  initialBlocks?: bigint;
  /** Largest window after growing back (default 100,000, the indexer's backfill window). */
  maxBlocks?: bigint;
  /** Below this a failing window is not halved again: the error is thrown (default 100). */
  minBlocks?: bigint;
  /** Called on every refused window, for the caller's log. */
  onRefused?: (from: bigint, to: bigint, why: string) => void;
}

export interface LogWalkStats {
  windows: number;
  refused: number;
}

const RANGE_HINT = /retry with the range (\d+)-(\d+)/;

function errorTexts(error: unknown): string[] {
  const out: string[] = [];
  for (let e: unknown = error, depth = 0; e && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    if (typeof e === "string") out.push(e);
    else if (typeof e === "object") for (const k of ["details", "shortMessage", "message"]) if (typeof (e as Record<string, unknown>)[k] === "string") out.push((e as Record<string, string>)[k]!);
  }
  return out;
}

/** The block range the RPC suggests after refusing a window for its result count, or null. */
export function suggestedLogRange(error: unknown): { from: bigint; to: bigint } | null {
  for (const text of errorTexts(error)) {
    const m = RANGE_HINT.exec(text);
    if (m) return { from: BigInt(m[1]!), to: BigInt(m[2]!) };
  }
  return null;
}

/**
 * Calls `fetchWindow(from, to)` over consecutive windows covering `[fromBlock, toBlock]` exactly once, in order. A
 * refused window is retried smaller (the RPC's suggested end when it starts at `from`, else half); an answered one
 * doubles the next, up to `maxBlocks`.
 */
export async function walkLogWindows(fromBlock: bigint, toBlock: bigint, fetchWindow: (from: bigint, to: bigint) => Promise<void>, options: LogWalkOptions = {}): Promise<LogWalkStats> {
  const max = options.maxBlocks ?? 100_000n;
  const min = options.minBlocks ?? 100n;
  let size = options.initialBlocks ?? 50_000n;
  const stats: LogWalkStats = { windows: 0, refused: 0 };
  for (let from = fromBlock; from <= toBlock; ) {
    const to = from + size - 1n > toBlock ? toBlock : from + size - 1n;
    try {
      await fetchWindow(from, to);
    } catch (error) {
      const hint = suggestedLogRange(error);
      const why = errorTexts(error)[0] ?? String(error);
      stats.refused++;
      options.onRefused?.(from, to, why);
      if (hint && hint.from === from && hint.to >= from && hint.to < to) size = hint.to - from + 1n;
      else if (size > min) size = size / 2n > min ? size / 2n : min;
      else throw error;
      continue;
    }
    stats.windows++;
    from = to + 1n;
    size = size * 2n > max ? max : size * 2n;
  }
  return stats;
}
