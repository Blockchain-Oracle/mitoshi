/**
 * Packing an actor's calls into a few transactions (D-230). Every ops actor shares one RPC budget per IP (D-134): a
 * send is four requests (simulate, clock, fill, send), so at a boundary the relay's 76 prints, the settler's 76
 * settles and sweeps and the maker's 38 fresh quotes queued behind each other for minutes — the opening print landed
 * 38–98 s after a Window's start and the book filled up to 211 s in (`scripts/drive/print-latency.ts`, 2026-10-13).
 * A Tempo transaction carries many calls, atomically, so the actors send units of calls instead:
 *
 * - a **unit** is calls that go together, in order, each needing the ones before it (a close and the next Window's
 *   open copied from it; a settle and the sweep after it; one Window's cancel and new pair);
 * - units pack into transactions of at most `maxCalls` calls, in the order given (the caller ranks them), a unit
 *   never split across two;
 * - a pack the chain refuses splits — each unit alone, then a refused unit's calls one at a time, in order, a call
 *   after a refused one left for the next pass — so one bad call never holds back the rest. A transport failure (rate
 *   limit, timeout) never splits: it would fail the same way in pieces, at more requests.
 */

import { OpsSendError } from "@cwf/markets/ops";

/**
 * Whether a failed send is the chain's answer (an engine error, or a mined revert) — which splits a pack, and counts
 * toward giving a print up — rather than the transport's (RPC 413/429/5xx, timeout), which never reached the engine
 * (D-131).
 */
export const chainRefused = (error: unknown): boolean => error instanceof OpsSendError && (error.errorName !== null || error.txHash !== null);

/** Calls per transaction by default: a RedStone print is ≈ 0.35 M gas, so a pack stays near 4 M, far under the cap. */
export const MAX_CALLS_PER_TX = 12;

export interface PackUnit<I> {
  /** In order; each needs the ones before it. */
  items: readonly I[];
}

/** Units into transactions of at most `maxCalls` calls, in the order given; a unit is never split across two. */
export function packUnits<U extends PackUnit<unknown>>(units: readonly U[], maxCalls = MAX_CALLS_PER_TX): U[][] {
  const packs: U[][] = [];
  let open: U[] = [];
  let calls = 0;
  for (const u of units) {
    if (u.items.length === 0) continue;
    if (open.length && calls + u.items.length > maxCalls) {
      packs.push(open);
      open = [];
      calls = 0;
    }
    open.push(u);
    calls += u.items.length;
  }
  if (open.length) packs.push(open);
  return packs;
}

/** How a pack goes out and how each call's outcome reads (one line per call). */
export interface PackSender<I> {
  /** Sends (or simulates) `items` as one transaction; resolves with its hash (or the simulation's note). */
  send: (items: readonly I[]) => Promise<string>;
  /** Whether a failure is the chain's answer (an engine error, a mined revert) rather than the transport's. */
  refused: (error: unknown) => boolean;
  landed: (item: I, hash: string, inTx: number) => string;
  failed: (item: I, error: unknown) => string;
  /** `item` was not tried: `after`, before it in its unit, did not land. */
  skipped: (item: I, after: I) => string;
  /** A unit the chain refused on its own: its owner's way through (the maker re-reads the book), else call by call. */
  unitRefused?: (unit: PackUnit<I>, error: unknown) => Promise<string[]>;
}

async function sendPack<I>(pack: readonly PackUnit<I>[], s: PackSender<I>): Promise<string[]> {
  const items = pack.flatMap((u) => u.items);
  try {
    const hash = await s.send(items);
    return items.map((i) => s.landed(i, hash, items.length));
  } catch (error) {
    if (items.length === 1 || !s.refused(error)) return items.map((i) => s.failed(i, error));
    const out: string[] = [];
    if (pack.length > 1) {
      for (const u of pack) out.push(...(await sendPack([u], s)));
      return out;
    }
    if (s.unitRefused) return s.unitRefused(pack[0]!, error);
    // One unit refused: its calls one at a time, in order; the first refused one stops the rest.
    const calls = pack[0]!.items;
    for (const [k, item] of calls.entries()) {
      try {
        out.push(s.landed(item, await s.send([item]), 1));
      } catch (e) {
        out.push(s.failed(item, e), ...calls.slice(k + 1).map((rest) => s.skipped(rest, item)));
        break;
      }
    }
    return out;
  }
}

/** Sends packs `concurrency` at a time, in order; one line per call, in pack order. */
export async function sendPacked<I>(packs: readonly (readonly PackUnit<I>[])[], s: PackSender<I>, concurrency = 6): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < packs.length; i += concurrency) out.push(...(await Promise.all(packs.slice(i, i + concurrency).map((p) => sendPack(p, s)))).flat());
  return out;
}
