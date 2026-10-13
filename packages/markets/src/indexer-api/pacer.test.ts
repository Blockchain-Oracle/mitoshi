/**
 * Pacing under the key's rate limit (R6): spacing between requests, a pause at the window's reset once the reserve is
 * reached, the server's Retry-After on a 429 (never under the exponential floor), a too-long wait handed to the caller,
 * transient retries, and the headers read off a real Response.
 */
import { describe, expect, it } from "vitest";
import { createIndexerClient, IndexerQueryError } from "./client";
import { createIndexerPacer, IndexerRateLimitError, rateLimitFromHeaders, retryAfterMsFrom, type RateLimitInfo } from "./pacer";

function clock(startMs = 1_791_911_464_000) {
  let t = startMs;
  const slept: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (slept.push(ms), (t += ms)), slept, advance: (ms: number) => void (t += ms) };
}
const limited = (retryAfterMs: number | null, rate: RateLimitInfo | null = null) => new IndexerQueryError("rate limited", 429, retryAfterMs, rate);

describe("rate-limit headers", () => {
  it("reads RateLimit-* and Retry-After (seconds or an HTTP date)", () => {
    const h = new Headers({ "ratelimit-limit": "20", "ratelimit-remaining": "19", "ratelimit-reset": "1791911520", "ratelimit-scope": "indexer:query", "retry-after": "12" });
    expect(rateLimitFromHeaders(h)).toEqual({ limit: 20, remaining: 19, resetSec: 1_791_911_520, scope: "indexer:query" });
    expect(retryAfterMsFrom(h, 0)).toBe(12_000);
    expect(retryAfterMsFrom(new Headers({ "retry-after": "Tue, 13 Oct 2026 17:12:00 GMT" }), Date.parse("Tue, 13 Oct 2026 17:11:30 GMT"))).toBe(30_000);
    expect(rateLimitFromHeaders(new Headers())).toBeNull();
  });
});

describe("pacer", () => {
  it("spaces request starts by minIntervalMs", async () => {
    const c = clock();
    const pacer = createIndexerPacer({ minIntervalMs: 3_500, now: c.now, sleep: c.sleep, random: () => 0 });
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => pacer.run(async () => starts.push(c.now()))));
    expect(starts.map((s) => s - starts[0]!)).toEqual([0, 3_500, 7_000]);
  });

  it("waits for the window's reset once Remaining is down to the reserve", async () => {
    const c = clock();
    const pacer = createIndexerPacer({ minIntervalMs: 0, reserve: 2, now: c.now, sleep: c.sleep, random: () => 0 });
    const resetSec = Math.floor(c.now() / 1000) + 40;
    pacer.observe({ limit: 20, remaining: 2, resetSec, scope: "indexer:query" });
    const at = await pacer.run(async () => c.now());
    expect(at).toBeGreaterThanOrEqual(resetSec * 1000);
    expect(c.slept).toHaveLength(1);
    // A reset in the past no longer holds anything back.
    pacer.observe({ limit: 20, remaining: 0, resetSec: Math.floor(c.now() / 1000) - 1, scope: null });
    await pacer.run(async () => 1);
    expect(c.slept).toHaveLength(1);
  });

  it("honours Retry-After on a 429, never below the exponential floor, then succeeds", async () => {
    const c = clock();
    const pacer = createIndexerPacer({ minIntervalMs: 0, now: c.now, sleep: c.sleep, random: () => 0 });
    const answers = [limited(12_000), limited(null), "ok"];
    const value = await pacer.run(async () => {
      const next = answers.shift()!;
      if (next instanceof Error) throw next;
      return next;
    });
    expect(value).toBe("ok");
    expect(c.slept).toEqual([12_000, 2_000]);
    expect(pacer.stats()).toMatchObject({ requests: 3, limited: 2, retries: 2 });
  });

  it("hands a wait longer than maxWaitMs to the caller instead of sleeping it", async () => {
    const c = clock();
    const pacer = createIndexerPacer({ minIntervalMs: 0, maxWaitMs: 65_000, now: c.now, sleep: c.sleep, random: () => 0 });
    const error = await pacer.run(async () => Promise.reject(limited(3_600_000, { limit: 20, remaining: 0, resetSec: null, scope: null }))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IndexerRateLimitError);
    expect((error as IndexerRateLimitError).retryAfterMs).toBe(3_600_000);
    expect((error as IndexerRateLimitError).limit).toBe(20);
    expect(c.slept).toEqual([]);
  });

  it("gives up after maxRetries 429s with the last Retry-After", async () => {
    const c = clock();
    const pacer = createIndexerPacer({ minIntervalMs: 0, maxRetries: 2, now: c.now, sleep: c.sleep, random: () => 0 });
    const error = await pacer.run(async () => Promise.reject(limited(5_000))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IndexerRateLimitError);
    expect(pacer.stats().requests).toBe(3);
  });

  it("retries 5xx twice, then throws; never retries a 400", async () => {
    const c = clock();
    const pacer = createIndexerPacer({ minIntervalMs: 0, now: c.now, sleep: c.sleep, random: () => 0 });
    let calls = 0;
    await expect(pacer.run(async () => (calls++, Promise.reject(new IndexerQueryError("bad gateway", 502))))).rejects.toThrow(/bad gateway/);
    expect(calls).toBe(3);
    calls = 0;
    await expect(pacer.run(async () => (calls++, Promise.reject(new IndexerQueryError("syntax error", 400))))).rejects.toThrow(/syntax/);
    expect(calls).toBe(1);
  });
});

describe("paced client", () => {
  it("feeds every answer's quota to the pacer and turns a 429 into its Retry-After", async () => {
    const c = clock();
    const pacer = createIndexerPacer({ minIntervalMs: 0, now: c.now, sleep: c.sleep, random: () => 0 });
    const body = JSON.stringify({ ok: true, columns: ["head"], rows: [[39_440_000]], row_count: 1 });
    const answers = [
      new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "Rate limit exceeded" } }), { status: 429, headers: { "retry-after": "7", "ratelimit-limit": "20", "ratelimit-remaining": "0", "ratelimit-reset": "1791911520" } }),
      new Response(body, { headers: { "content-type": "application/json", "ratelimit-limit": "20", "ratelimit-remaining": "19", "ratelimit-reset": "1791911580" } }),
    ];
    const client = createIndexerClient(42431, { kind: "mpp", session: { fetch: async () => answers.shift()! } }, { pacer });
    expect((await client.query({ sql: "SELECT max(num) AS head FROM blocks" })).rows).toEqual([{ head: 39_440_000 }]);
    expect(c.slept).toEqual([7_000]);
    expect(pacer.stats()).toMatchObject({ requests: 2, limited: 1, last: { limit: 20, remaining: 19 } });
    expect(client.archiveEngine).toBe("clickhouse");
  });
});
