/** The recount's `/health` line (R6): ok, catching up, a mismatch first, the key's rate limit, and the index's gaps. */
import { describe, expect, it } from "vitest";
import type { RecountPassResult, RecountRow } from "@cwf/markets/server";
import { CATCHUP_DELAY_MS, recountReport } from "./report";

const HOUR = 3_600_000;
const base: RecountPassResult = {
  via: "api-key",
  toBlock: 39_440_000n,
  fromBlock: 37_362_986n,
  rows: [],
  mismatches: [],
  items: { done: 1, left: 0 },
  logs: 7_012n,
  compared: { blocks: 2_056_651n, of: 2_077_015n },
  gaps: [{ from: 38_712_662n, to: 38_732_071n }, { from: 39_197_501n, to: 39_197_503n }],
  stopped: null,
};

describe("recount report", () => {
  it("reads ok with the share compared and the index's gaps, and waits the hour", () => {
    const r = recountReport(base, null, HOUR);
    expect(r.why).toBe("recount ok at ≤39440000 via api-key: 99.0% of 2,077,015 blocks compared, 7,012 logs matched this pass · the index lacks 19,413 blocks in 2 gaps (largest 38712662–38732071), skipped until it backfills them");
    expect(r.nextDelayMs).toBe(HOUR);
    expect(r.detail).toMatchObject({ gaps: { count: 2, blocks: 19_413, ranges: ["38712662–38732071", "39197501–39197503"] }, mismatches: 0 });
  });

  it("comes back in a minute while history is still being compared", () => {
    const r = recountReport({ ...base, items: { done: 9, left: 95 }, stopped: { by: "budget" }, compared: { blocks: 180_000n, of: 2_077_015n } }, null, HOUR);
    expect(r.why).toMatch(/^catching up \(95 items left\) at ≤39440000 via api-key: 8\.6% of 2,077,015 blocks compared/);
    expect(r.nextDelayMs).toBe(CATCHUP_DELAY_MS);
  });

  it("leads with a mismatch, naming the contract, event, range and both counts", () => {
    const m = { contract: "EventsEngine", event: "Filled", fromBlock: 39_420_000n, toBlock: 39_439_999n, indexerCount: 166n, localCount: 167n, match: false } as RecountRow;
    const r = recountReport({ ...base, rows: [m], mismatches: [m] }, null, HOUR);
    expect(r.why).toMatch(/^MISMATCH at ≤39440000 via api-key: EventsEngine\.Filled \[39420000–39439999\] indexer 166 vs chain 167 · the index lacks/);
  });

  it("pauses on the key's rate limit for what it asked, never under a minute", () => {
    const rate = { requests: 9, limited: 3, retries: 2, waits: 4, waitedMs: 30_000, last: { limit: 20, remaining: 0, resetSec: 1_791_911_520, scope: "indexer:query" } };
    const r = recountReport({ ...base, items: { done: 2, left: 5 }, stopped: { by: "rate-limit", retryAfterMs: 90_000 } }, rate, HOUR);
    expect(r.why).toMatch(/^paused: the indexer key is rate-limited \(20\/window\), resuming in 91s at ≤39440000/);
    expect(r.nextDelayMs).toBe(91_000);
    expect(recountReport({ ...base, stopped: { by: "rate-limit", retryAfterMs: 5_000 } }, rate, HOUR).nextDelayMs).toBe(CATCHUP_DELAY_MS);
    expect(r.detail).toMatchObject({ rate: { limit: 20, limited: 3 }, stopped: "rate-limit" });
  });

  it("says when the index holds every block", () => {
    expect(recountReport({ ...base, gaps: [] }, null, HOUR).why).toMatch(/· the index holds every block$/);
  });
});
