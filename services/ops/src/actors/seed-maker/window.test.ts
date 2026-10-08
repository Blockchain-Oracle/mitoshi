import { beforeEach, describe, expect, it, vi } from "vitest";

// The chain reads are stubbed; `dryRun` turns every send into a log line, so the test reads what the maker would send.
let resting: unknown[] = [];
vi.mock("@cwf/markets/ops", async (orig) => ({
  ...(await orig<typeof import("@cwf/markets/ops")>()),
  openOrdersOf: vi.fn(async () => resting),
  positionsOf: vi.fn(async () => [null]),
  topOfBook: vi.fn(async () => ({ bidTicks: 0, askTicks: 0, bidLots: 0n, askLots: 0n })),
  sendOps: vi.fn(async () => {
    throw new Error("dryRun never sends");
  }),
}));

const { tendWindow } = await import("./window");
const { STOP_BEFORE_LOCK_SEC, TAIL_FROM_LOCK_SEC } = await import("./quote");

const LOCK = 1_000_000;
const env = { quoteLots: 5_000n, halfSpreadTicks: 30, minTick: 20, requoteTicks: 10, quoteTtlSec: 120 };
const series = { cashUnit: 1n, minLots: 1n };
const market = { state: 0, tradingStartSec: LOCK - 300, lockAtSec: LOCK, marketId: `0x${"01".padStart(64, "0")}` };
const lane = (phase: "quote" | "stop" | "pull", tail = false) => ({ phase, fairTicks: phase === "quote" ? 500 : null, maxCashPerWindow: 10n ** 12n, tail, why: phase });

function run(nowSec: number, l: ReturnType<typeof lane>, placed: { fairTicks: number; expireSec: number; halfSpreadTicks?: number } | null, clockSec?: () => number) {
  const logs: string[] = [];
  const ctx = { client: { address: "0x00000000000000000000000000000000000000aa" }, venue: { engine: "0x00000000000000000000000000000000000000ee" }, env, dryRun: true, nowSec, clockSec, log: (w: string) => void logs.push(w) };
  return tendWindow(ctx as never, series as never, market as never, l as never, placed, "BTC-5m #1").then((r) => ({ r, logs }));
}

describe("the seed maker's last minute in one Window (D-194, D-204)", () => {
  beforeEach(() => {
    resting = [];
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
    expect(logs.filter((l) => l.startsWith("DRY post"))).toEqual([
      `DRY post bid 2500 @ 440 (fair 500, exp ${LOCK - 30}) BTC-5m #1`,
      `DRY post ask 2500 @ 560 (fair 500, exp ${LOCK - 30}) BTC-5m #1`,
    ]);
    expect(r.placed?.halfSpreadTicks).toBe(60);
  });

  it("quotes in full before the tail", async () => {
    const { logs } = await run(LOCK - TAIL_FROM_LOCK_SEC - 30, lane("quote"), null);
    expect(logs.filter((l) => l.startsWith("DRY post"))[0]).toMatch(/^DRY post bid 5000 @ 470 /);
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
    expect(logs.filter((l) => l.startsWith("DRY post"))).toEqual([]);
    expect(logs.filter((l) => l.includes("to expiry, skipped"))).toHaveLength(2);
  });
});
