import { beforeEach, describe, expect, it, vi } from "vitest";

// The chain reads are stubbed; `dryRun` turns every send into a log line, so the test reads what the maker would send.
let resting: unknown[] = [];
// A live run's sends: each records how many calls it carried; `refuseBatch` makes a multi-call send fail as gas
// estimation does for a batch that would revert.
let sent: number[] = [];
let refuseBatch = false;
vi.mock("@cwf/markets/ops", async (orig) => {
  const real = await orig<typeof import("@cwf/markets/ops")>();
  return {
    ...real,
    openOrdersOf: vi.fn(async () => resting),
    positionsOf: vi.fn(async () => [null]),
    topOfBook: vi.fn(async () => ({ bidTicks: 0, askTicks: 0, bidLots: 0n, askLots: 0n })),
    sendOps: vi.fn(async (_c: unknown, calls: readonly unknown[]) => {
      if (refuseBatch && calls.length > 1) throw new real.OpsSendError("send failed: PostOnlyWouldCross", "PostOnlyWouldCross");
      sent.push(calls.length);
      return { hash: `0x${String(sent.length).padStart(64, "0")}`, receipt: {} };
    }),
  };
});

const { tendWindow } = await import("./window");
const { STOP_BEFORE_LOCK_SEC, TAIL_FROM_LOCK_SEC } = await import("./quote");

const LOCK = 1_000_000;
const env = { quoteLots: 5_000n, halfSpreadTicks: 30, minTick: 20, requoteTicks: 10, quoteTtlSec: 120 };
const series = { cashUnit: 1n, minLots: 1n };
const market = { state: 0, tradingStartSec: LOCK - 300, lockAtSec: LOCK, marketId: `0x${"01".padStart(64, "0")}` };
const lane = (phase: "quote" | "stop" | "pull", tail = false) => ({ phase, fairTicks: phase === "quote" ? 500 : null, maxCashPerWindow: 10n ** 12n, tail, why: phase });

function run(nowSec: number, l: ReturnType<typeof lane>, placed: { fairTicks: number; expireSec: number; halfSpreadTicks?: number } | null, clockSec?: () => number, dryRun = true) {
  const logs: string[] = [];
  const ctx = { client: { address: "0x00000000000000000000000000000000000000aa" }, venue: { engine: "0x00000000000000000000000000000000000000ee" }, env, dryRun, nowSec, clockSec, log: (w: string) => void logs.push(w) };
  return tendWindow(ctx as never, series as never, market as never, l as never, placed, "BTC-5m #1").then((r) => ({ r, logs }));
}

describe("the seed maker's last minute in one Window (D-194, D-204)", () => {
  beforeEach(() => {
    resting = [];
    sent = [];
    refuseBatch = false;
  });

  it("leaves a pair already resting to lock − 30 alone in the tail: no requote just to widen", async () => {
    resting = [{}, {}];
    const { r, logs } = await run(LOCK - 60, lane("quote", true), { fairTicks: 500, expireSec: LOCK - 30, halfSpreadTicks: 30 });
    expect(r.state).toBe("resting");
    expect(logs).toEqual([]);
  });

  it("places what it must in the tail at half the size and twice the spread", async () => {
    const { r, logs } = await run(LOCK - 60, lane("quote", true), null);
    expect(r.state).toBe("quoting");
    expect(logs).toEqual([`DRY fresh quote: post bid 2500 @ 440; post ask 2500 @ 560 (fair 500, exp ${LOCK - 30}) BTC-5m #1`]);
    expect(r.placed?.halfSpreadTicks).toBe(60);
  });

  it("quotes in full before the tail", async () => {
    const { logs } = await run(LOCK - TAIL_FROM_LOCK_SEC - 30, lane("quote"), null);
    expect(logs[0]).toMatch(/post bid 5000 @ 470; post ask 5000 @ 530 /);
  });

  it("lets resting orders lapse at a stop, but cancels them at once on a pull", async () => {
    resting = [{}, {}];
    const stopped = await run(LOCK - STOP_BEFORE_LOCK_SEC + 5, lane("stop"), { fairTicks: 500, expireSec: LOCK - 30 });
    expect(stopped.r.state).toBe("stopped");
    expect(stopped.logs.some((l) => l.includes("cancelAll"))).toBe(false);
    const pulled = await run(LOCK - 200, lane("pull"), { fairTicks: 500, expireSec: LOCK - 30 });
    expect(pulled.r.state).toBe("pulled");
    expect(pulled.logs.some((l) => l.startsWith("DRY cancelAll (2)"))).toBe(true);
  });

  it("skips a placement the pass reaches too late to rest, instead of paying for OrderAlreadyExpired", async () => {
    const { logs } = await run(LOCK - 50, lane("quote", true), null, () => LOCK - 35);
    expect(logs).toEqual(["BTC-5m #1: under 8 s to expiry, nothing placed"]);
  });

  it("requotes in one transaction — cancel, then the new pair — so no side is ever missing between them", async () => {
    resting = [{ kind: 0, priceTicks: 470, lots: 5_000n }, { kind: 2, priceTicks: 530, lots: 5_000n }];
    const dry = await run(LOCK - 200, lane("quote"), { fairTicks: 480, expireSec: LOCK - 30, halfSpreadTicks: 30 });
    expect(dry.logs).toEqual([`DRY requote 480 → 500: cancelAll (2); post bid 5000 @ 470; post ask 5000 @ 530 (fair 500, exp ${LOCK - 80}) BTC-5m #1`]);
    const live = await run(LOCK - 200, lane("quote"), { fairTicks: 480, expireSec: LOCK - 30, halfSpreadTicks: 30 }, undefined, false);
    expect(sent).toEqual([3]);
    expect(live.r.txs).toHaveLength(1);
    expect(live.r.placed).toEqual({ fairTicks: 500, expireSec: LOCK - 80, halfSpreadTicks: 30 });
  });

  it("falls back to one call at a time when the one-transaction requote would revert", async () => {
    resting = [{ kind: 0, priceTicks: 470, lots: 5_000n }];
    refuseBatch = true;
    const { r, logs } = await run(LOCK - 200, lane("quote"), { fairTicks: 480, expireSec: LOCK - 30, halfSpreadTicks: 30 }, undefined, false);
    expect(logs[0]).toMatch(/one-transaction requote refused \(PostOnlyWouldCross\)/);
    expect(sent).toEqual([1, 1, 1]);
    expect(r.state).toBe("quoting");
    expect(r.placed?.fairTicks).toBe(500);
  });
});
