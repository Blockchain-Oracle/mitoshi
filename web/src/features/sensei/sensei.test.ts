import { describe, expect, it } from "vitest";
import { senseiTurnContext } from "./prompt";
import type { SenseiRequest } from "./protocol";
import { recordOf } from "./record";
import { encodeEvent, takeEvents } from "./stream";

const base: SenseiRequest = { messages: [{ role: "user", content: "Read this Window" }], consent: { version: "x", provider: "anthropic" }, snapshot: null, restless: false };

describe("Sensei's wire", () => {
  it("reads whole lines and hands back the unfinished tail", () => {
    const wire = encodeEvent({ t: "delta", v: "UP, " }) + encodeEvent({ t: "delta", v: "the line holds." }) + '{"t":"do';
    const first = takeEvents(wire);
    expect(first.events).toEqual([{ t: "delta", v: "UP, " }, { t: "delta", v: "the line holds." }]);
    expect(takeEvents(first.rest + 'ne"}\n').events).toEqual([{ t: "done" }]);
  });
});

describe("Sensei's turn", () => {
  it("says the market is closed instead of inventing a read", () => {
    const text = senseiTurnContext({ ...base, session: { state: "closed", label: "Opens Mon 09:30 ET" } }, false);
    expect(text).toContain("NYSE session: closed, opens Mon 09:30 ET.");
    expect(text).toContain("No Window on screen is open for calls");
  });

  it("prices each side from the book and names the lane", () => {
    const text = senseiTurnContext({ ...base, snapshot: { prices: { TSLA: 382.42 }, windows: [{ asset: "TSLA", cadence: "5m", lane: "stock24", minsToClose: 3, lineUsd: 382.1, upCents: 57, downCents: null }] } }, false);
    expect(text).toContain("Live prices, just read: TSLA $382.42.");
    expect(text).toContain("- TSLA 5m 24/7, closes in 3 min, line $382.10, UP 57c, DOWN unquoted");
  });

  it("carries the cues: a losing run, the pace, an advice question", () => {
    const text = senseiTurnContext({ ...base, restless: true, record: { settled: 6, wins: 2, losses: 4, streak: -3 } }, true);
    expect(text).toContain("a tilt cue");
    expect(text).toContain("refuse it plainly");
    expect(text).toContain("Their record: 6 settled, 2 won, 4 lost, and lost the last 3.");
  });

  it("stays under 2.5 KB with everything at its cap", () => {
    const full: SenseiRequest = {
      ...base,
      restless: true,
      session: { state: "regular", label: "Closes 16:00 ET" },
      record: { settled: 120, wins: 61, losses: 57, streak: -4 },
      snapshot: { prices: { TSLA: 382.42 }, windows: Array.from({ length: 8 }, () => ({ asset: "TSLA", cadence: "15m", lane: "regular" as const, minsToClose: 14, lineUsd: 382.42, upCents: 51, downCents: 52 })) },
      positions: Array.from({ length: 8 }, () => ({ asset: "NVDA", cadence: "1h", side: "down" as const, via: "boost" as const, stakeCents: 2_500, markCents: 3_120, minsToClose: 42 })),
      earnings: Array.from({ length: 10 }, () => ({ symbol: "TSLA", dateEt: "2026-10-21", hour: "amc" as const })),
    };
    expect(new TextEncoder().encode(senseiTurnContext(full, true)).length).toBeLessThan(2_560);
  });
});

describe("the record", () => {
  it("counts the run back from the newest decided round", () => {
    const r = (expirySec: number, pnl: bigint) => ({ expirySec, pnlBase: pnl });
    expect(recordOf([r(1, 5n), r(2, -1n), r(3, 0n), r(4, -2n), r(5, -3n)])).toEqual({ settled: 5, wins: 1, losses: 3, streak: -3 });
    expect(recordOf([r(2, -1n), r(1, -1n), r(3, 4n), r(4, 1n)])).toEqual({ settled: 4, wins: 2, losses: 2, streak: 2 });
    expect(recordOf([])).toEqual({ settled: 0, wins: 0, losses: 0, streak: 0 });
  });
});
