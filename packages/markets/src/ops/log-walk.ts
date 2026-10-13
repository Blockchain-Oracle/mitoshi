/**
 * `eth_getLogs` over a long range in windows the RPC accepts. Moderato refuses a window holding more than 20,000 logs
 * with `-32602 "query exceeds max results 20000, retry with the range A-B"` (measured 2026-09-30): the walk retries with
 * the range the RPC names, halves when an error names none, and doubles again after every answered window — the ops
 * indexer's window rule (`services/ops/src/actors/indexer/window.ts`) plus the RPC's own hint (D-187).
 *
 * Alchemy's Moderato endpoint (ops' private RPC since 2026-10-13) caps the range instead and names a hex range that fits:
 * `-32600 "You can make eth_getLogs requests with up to a 10000 block range. Based on your parameters, this block range
 * should work: [0x25317c0, 0x2533ecf]"` (measured 2026-10-13); the walk takes that hint the same way.
 *
 * A refusal that names no range (Moderato aborting a body over its size limit, or timing out — F-S5-02) is a ceiling
 * too: growth stays under ¾ of the smallest such window, so a dense chain isn't refused once per window (each refusal
 * there costs a large aborted transfer). After `RELAX_AFTER` answered windows in a row the ceiling doubles, so a
 * quieter stretch can widen again.
 */
const RELAX_AFTER = 16;

/** A transport failure, not a refusal: the RPC never answered, so the window's size says nothing about it. */
const TRANSIENT = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network error|other side closed/i;

export interface LogWalkOptions {
  /** First window, in blocks (default 50,000). */
  initialBlocks?: bigint;
  /** Largest window after growing back (default 100,000, the indexer's backfill window). */
  maxBlocks?: bigint;
  /** Below this a failing window is not halved again: the error is thrown (default 100). */
  minBlocks?: bigint;
  /** Called on every refused window, for the caller's log. */
  onRefused?: (from: bigint, to: bigint, why: string) => void;
  /** Retries of the same window after a transport failure, waiting 2 s doubling to 60 s (default 8, ~5 min). */
  transientRetries?: number;
  /** Test seam for the wait between transient retries. */
  sleep?: (ms: number) => Promise<void>;
}

export interface LogWalkStats {
  windows: number;
  refused: number;
}

const RANGE_HINT = /retry with the range (\d+)-(\d+)/;
const HEX_RANGE_HINT = /block range should work: \[(0x[0-9a-f]+),\s*(0x[0-9a-f]+)\]/i;

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
    const m = RANGE_HINT.exec(text) ?? HEX_RANGE_HINT.exec(text);
    if (m) return { from: BigInt(m[1]!), to: BigInt(m[2]!) };
  }
  return null;
}

/**
 * Calls `fetchWindow(from, to)` over consecutive windows covering `[fromBlock, toBlock]` exactly once, in order. A
 * refused window is retried smaller (the RPC's suggested end when it starts at `from`, else half); an answered one
 * doubles the next, up to `maxBlocks` and under the ceiling an un-hinted refusal set.
 */
export async function walkLogWindows(fromBlock: bigint, toBlock: bigint, fetchWindow: (from: bigint, to: bigint) => Promise<void>, options: LogWalkOptions = {}): Promise<LogWalkStats> {
  const max = options.maxBlocks ?? 100_000n;
  const min = options.minBlocks ?? 100n;
  let size = options.initialBlocks ?? 50_000n;
  /** The smallest window refused without a hint; growth stays under ¾ of it. */
  let ceiling: bigint | null = null;
  let answered = 0;
  let transient = 0;
  const retries = options.transientRetries ?? 8;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const stats: LogWalkStats = { windows: 0, refused: 0 };
  for (let from = fromBlock; from <= toBlock; ) {
    const to = from + size - 1n > toBlock ? toBlock : from + size - 1n;
    try {
      await fetchWindow(from, to);
      transient = 0;
    } catch (error) {
      const hint = suggestedLogRange(error);
      const why = errorTexts(error)[0] ?? String(error);
      stats.refused++;
      answered = 0;
      options.onRefused?.(from, to, why);
      // The network dropped the request: wait and ask for the same window again (F-S5-02, a recount lost at 85 %).
      if (!hint && errorTexts(error).some((t) => TRANSIENT.test(t)) && transient < retries) {
        await sleep(Math.min(60_000, 2_000 * 2 ** transient++));
        continue;
      }
      transient = 0;
      if (hint && hint.from === from && hint.to >= from && hint.to < to) size = hint.to - from + 1n;
      else if (to - from + 1n > min) {
        // Halve the window actually tried (a tail clipped at `toBlock` is shorter than `size`), so a refusal always
        // shrinks the next request.
        const tried = to - from + 1n;
        ceiling = ceiling === null || tried < ceiling ? tried : ceiling;
        size = tried / 2n > min ? tried / 2n : min;
      } else throw error;
      continue;
    }
    stats.windows++;
    from = to + 1n;
    if (ceiling !== null && ++answered >= RELAX_AFTER) {
      ceiling *= 2n;
      answered = 0;
    }
    const cap = ceiling === null ? max : (ceiling * 3n) / 4n < max ? (ceiling * 3n) / 4n : max;
    const grown = size * 2n > cap ? cap : size * 2n;
    size = grown > size ? grown : size;
  }
  return stats;
}
