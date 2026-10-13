/**
 * The recount's line on `/health` (R6, D-230): what was compared, any mismatch first, the index's gaps, and the key's
 * quota. Pure, so the wording is tested; the pass in `./index.ts` does the I/O.
 */
import { blockCount, formatRange, largestRange, type PacerStats, type RecountPassResult } from "@cwf/markets/server";
import type { PassResult } from "../../runtime";

/** While history is still being compared, the next pass comes this soon instead of in an hour. */
export const CATCHUP_DELAY_MS = 60_000;
/** Gaps listed by range in the detail (the count and total cover the rest). */
const GAPS_LISTED = 12;

const n = (v: bigint | number) => Number(v).toLocaleString("en-US");

function percent(blocks: bigint, of: bigint): string {
  if (of <= 0n) return "0";
  const tenths = (blocks * 1000n) / of;
  return tenths >= 1000n ? "100" : `${tenths / 10n}.${tenths % 10n}`;
}

export function gapsLine(result: Pick<RecountPassResult, "gaps">): string {
  if (!result.gaps.length) return "the index holds every block";
  const largest = largestRange(result.gaps)!;
  return `the index lacks ${n(blockCount(result.gaps))} blocks in ${n(result.gaps.length)} gap${result.gaps.length === 1 ? "" : "s"} (largest ${formatRange(largest)}), skipped until it backfills them`;
}

export function recountReport(result: RecountPassResult, rate: PacerStats | null, everyMs: number): PassResult {
  const compared = `${percent(result.compared.blocks, result.compared.of)}% of ${n(result.compared.of)} blocks compared`;
  const gaps = gapsLine(result);
  const quota = rate?.last?.limit ? `${rate.last.limit}/window` : null;
  const detail: Record<string, unknown> = {
    via: result.via,
    toBlock: Number(result.toBlock),
    fromBlock: result.fromBlock === null ? null : Number(result.fromBlock),
    items: result.items,
    logs: Number(result.logs),
    rows: result.rows.length,
    mismatches: result.mismatches.length,
    compared: { blocks: Number(result.compared.blocks), of: Number(result.compared.of) },
    gaps: { count: result.gaps.length, blocks: Number(blockCount(result.gaps)), ranges: result.gaps.slice(0, GAPS_LISTED).map(formatRange) },
    ...(rate ? { rate: { limit: rate.last?.limit ?? null, remaining: rate.last?.remaining ?? null, requests: rate.requests, limited: rate.limited, retries: rate.retries, waitedMs: rate.waitedMs } } : {}),
    ...(result.stopped ? { stopped: result.stopped.by } : {}),
  };
  const behind = result.stopped !== null || result.items.left > 0;
  const nextDelayMs = result.stopped?.by === "rate-limit" ? Math.max(result.stopped.retryAfterMs + 1_000, CATCHUP_DELAY_MS) : behind ? CATCHUP_DELAY_MS : everyMs;
  if (result.mismatches.length) {
    const first = result.mismatches.slice(0, 3).map((m) => `${m.contract}.${m.event} [${m.fromBlock}–${m.toBlock}] indexer ${m.indexerCount} vs chain ${m.localCount}`).join("; ");
    return { why: `MISMATCH at ≤${result.toBlock} via ${result.via}: ${first}${result.mismatches.length > 3 ? ` (+${result.mismatches.length - 3})` : ""} · ${gaps}`, detail, nextDelayMs };
  }
  const head = result.stopped?.by === "rate-limit"
    ? `paused: the indexer key is rate-limited${quota ? ` (${quota})` : ""}, resuming in ${Math.ceil(nextDelayMs / 1000)}s`
    : behind
      ? `catching up (${result.items.left} item${result.items.left === 1 ? "" : "s"} left)`
      : "recount ok";
  return { why: `${head} at ≤${result.toBlock} via ${result.via}: ${compared}, ${n(result.logs)} logs matched this pass · ${gaps}`, detail, nextDelayMs };
}
