import { describe, expect, it } from "vitest";
import type { EventMarket } from "@cwf/core";
import type { DecisionWire, StrategyWire } from "../strategies/protocol";
import { nextDecisionOf } from "./next-decision";
import { pulseOf } from "./pulse";

const SERIES = `0x${"cd".repeat(32)}`;
const T0 = 1_791_910_200;
const win = (start: number, over: Partial<EventMarket> = {}): EventMarket =>
  ({ marketId: `0x${String(start).padStart(64, "0")}`, seriesId: SERIES, lane: "crypto24", intervalSec: 300, tradingStartSec: start, lockAtSec: start + 300, expirySec: start + 300, openingPriceRaw: 1n, state: "open", ...over }) as unknown as EventMarket;
const rule = { spec: { preset: "reversion", lookback: 4, thresholdBps: 5 }, envelope: { series: SERIES, seriesLabel: "ETH 5m" } } as unknown as StrategyWire;
const agent = { spec: { preset: "agent", persona: "x", posture: "guarded", cadences: [300] }, envelope: { series: SERIES, seriesLabel: "BTC 5m" } } as unknown as StrategyWire;
const decided = (m: EventMarket, atSec: number, side: "up" | "down" | null = "up"): DecisionWire =>
  ({ marketId: m.marketId, decidedAtMs: atSec * 1000, verdictSide: side ?? "hold", confidence: null, why: "", gate: side ? "trade" : "held", gateReason: "", side, filled: 0, model: "rule/reversion", label: "ETH 5m", outcome: "open" }) as DecisionWire;
const at = (sec: number) => sec * 1000;

describe("the next decision", () => {
  it("is unknown before the clock's first tick or the lanes' first read — never a countdown from 1970", () => {
    expect(nextDecisionOf(rule, [win(T0)], [], 0)).toEqual({ kind: "unknown" });
    expect(nextDecisionOf(rule, null, [], at(T0 + 10))).toEqual({ kind: "unknown" });
  });

  it("a rule watches its live Window until the entry cutoff, then waits for the next one", () => {
    const m = win(T0);
    expect(nextDecisionOf(rule, [m], [], at(T0 + 60))).toMatchObject({ kind: "watching", atSec: T0 + 270, spanSec: 270 });
    expect(nextDecisionOf(rule, [m], [], at(T0 + 280))).toMatchObject({ kind: "between", atSec: T0 + 300 });
    expect(nextDecisionOf(rule, [m], [decided(m, T0 + 90)], at(T0 + 120))).toMatchObject({ kind: "decided", atSec: T0 + 300, spanSec: 210 });
  });

  it("an agent reads in its slot: opens a quarter in, then the next Window's slot once decided", () => {
    const m = win(T0);
    expect(nextDecisionOf(agent, [m], [], at(T0 + 30))).toMatchObject({ kind: "reads-in", atSec: T0 + 75, spanSec: 75 });
    expect(nextDecisionOf(agent, [m], [], at(T0 + 100))).toMatchObject({ kind: "reading", atSec: T0 + 240 });
    expect(nextDecisionOf(agent, [m], [decided(m, T0 + 80, null)], at(T0 + 100))).toMatchObject({ kind: "decided", atSec: T0 + 375 });
    expect(nextDecisionOf(agent, [win(T0, { intervalSec: 900 })], [], at(T0 + 30))).toEqual({ kind: "closed" });
  });

  it("mirrors the runner: no decision on a Window whose opening print isn't in, nor one past its entry cutoff", () => {
    const pending = win(T0, { openingPriceRaw: null });
    expect(nextDecisionOf(rule, [pending], [], at(T0 + 20))).toEqual({ kind: "awaiting-print", market: pending });
    expect(nextDecisionOf(agent, [pending], [], at(T0 + 100))).toEqual({ kind: "awaiting-print", market: pending });
    expect(nextDecisionOf(rule, [pending], [], at(T0 + 280))).toMatchObject({ kind: "between", atSec: T0 + 300 });
    // Another series' Window it can call now comes before one waiting on its print.
    const any = { ...rule, envelope: { series: null, seriesLabel: null } } as unknown as StrategyWire;
    const live = win(T0, { seriesId: `0x${"ab".repeat(32)}`, marketId: `0x${"ab".repeat(32)}` } as Partial<EventMarket>);
    expect(nextDecisionOf(any, [pending, live], [], at(T0 + 20))).toMatchObject({ kind: "watching", market: live });
    expect(nextDecisionOf(rule, [win(T0, { state: "resolved" } as Partial<EventMarket>)], [], at(T0 + 20))).toEqual({ kind: "closed" });
  });

  it("is closed with no trading Window of its series", () => {
    expect(nextDecisionOf(rule, [win(T0, { seriesId: `0x${"ab".repeat(32)}` })], [], at(T0 + 10))).toEqual({ kind: "closed" });
    expect(nextDecisionOf(rule, [win(T0)], [], at(T0 + 400))).toEqual({ kind: "closed" });
  });
});

describe("the runner's pass in words", () => {
  const base = { active: true, spec: rule.spec, envelope: rule.envelope };
  const health = (state: StrategyWire["health"]["state"], kind: StrategyWire["health"]["kind"] = "alive") => ({ kind, lastTickMs: at(T0), intervalMs: 30_000, why: "raw", state });
  it("says what it watches and how close its trigger is", () => {
    expect(pulseOf({ ...base, health: health({ kind: "scan", copiers: 1, windows: 1, closestBps: 3, calls: 0, filled: 0, skipped: {} }) }, at(T0)).line).toBe("Watching ETH 5m — 3 bps from its trigger");
    expect(pulseOf({ ...base, health: health({ kind: "scan", copiers: 1, windows: 0, closestBps: null, calls: 0, filled: 0, skipped: {} }) }, at(T0)).line).toBe("No ETH 5m Window open");
  });
  it("names why a call wasn't copied", () => {
    const p = pulseOf({ ...base, health: health({ kind: "scan", copiers: 2, windows: 1, closestBps: 0, calls: 1, filled: 0, skipped: { budget: 2 } }) }, at(T0));
    expect(p).toEqual({ tone: "warn", line: "Not copied · copiers out of budget", deciding: true });
    expect(pulseOf({ ...base, health: health({ kind: "scan", copiers: 2, windows: 1, closestBps: 0, calls: 1, filled: 2, skipped: {} }) }, at(T0)).line).toBe("Copied for 2");
  });
  it("is not deciding when idle, closed or quiet — and never shows the raw log line", () => {
    expect(pulseOf({ ...base, health: health({ kind: "idle", idle: "no-copier", copiers: 0 }) }, at(T0))).toEqual({ tone: "quiet", line: "Waiting for its first copier", deciding: false });
    expect(pulseOf({ ...base, active: false, health: health(null) }, at(T0)).line).toBe("Closed to new copiers");
    expect(pulseOf({ ...base, health: health(null, "stale") }, at(T0 + 600)).line).toBe("Runner quiet · seen 10m ago");
    expect(pulseOf({ ...base, health: health(null) }, at(T0)).line).toBe("Running");
  });
});
