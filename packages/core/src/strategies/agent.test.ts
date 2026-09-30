// Ported from Masayume 68f7a09:packages/core/src/strategies/agent.test.ts
import { describe, expect, it } from "vitest";
import { agentPrompt } from "./agent-prompt";
import { AGENT_PERSONA_MAX_CHARS, decisionSlot, EMPTY_AGENT_RECORD, gateAgentVerdict, POSTURES, type AgentContext, type AgentRecordSummary, type AgentVerdict } from "./agent";
import { describeSpec, encodeSpec, isSpec, parseStrategyMetadata } from "./spec";
import type { AgentSpec } from "./types";

const ONE = 1_000_000n;
const FEED = 100_000_000n;
const spec: AgentSpec = { preset: "agent", persona: "Trade the trend, sit out chop.", posture: "balanced", cadences: [900, 3600] };
const envelope = { maxStakePerTradeBase: 5n * ONE, maxDailySpendBase: 50n * ONE, maxOpenPositions: 2, maxPriceRaw: 0n, market: null };
const NOW_SEC = 1_788_400_000;

const context = (over: Partial<AgentContext> = {}): AgentContext => ({
  asset: "BTC",
  intervalSec: 900,
  tradingStartSec: NOW_SEC - 300,
  openingRaw: 62_150n * FEED,
  emaRaw: 62_200n * FEED,
  spotRaw: 62_210n * FEED,
  feedDecimals: 8,
  samples: [
    { atSec: NOW_SEC - 270, priceRaw: 62_140n * FEED },
    { atSec: NOW_SEC - 30, priceRaw: 62_205n * FEED },
  ],
  upCents: 62,
  downCents: 40,
  stakeBase: 5n * ONE,
  collateralDecimals: 6,
  elapsedSec: 300,
  leftSec: 600,
  ...over,
});

const up = (confidence = 0.72): AgentVerdict => ({ side: "up", confidence, why: "EMA above the print and rising" });
const gate = (verdict: AgentVerdict | null, over: Partial<Parameters<typeof gateAgentVerdict>[0]> = {}) => gateAgentVerdict({ verdict, spec, context: context(), record: EMPTY_AGENT_RECORD, envelope, nowSec: NOW_SEC, ...over });

describe("gateAgentVerdict", () => {
  it("holds with the failure named when there is no verdict, before anything else", () => {
    const d = gate(null, { failure: "timeout after 20000 ms" });
    expect(d.side).toBeNull();
    expect(d.reason).toBe("model unavailable: timeout after 20000 ms");
    expect(d.thresholdBps).toBe(0);
    expect(d.moveBps).toBe(8);
  });
  it("respects the model's own hold", () => {
    expect(gate({ side: "hold", confidence: 0.9, why: "chop" }).reason).toBe("agent held: chop");
  });
  it("holds under the posture's confidence floor", () => {
    expect(gate(up(0.64)).reason).toMatch(/^confidence 0\.64 under the balanced floor 0\.65/);
    expect(gate(up(0.65)).side).toBe("up");
    expect(gateAgentVerdict({ verdict: up(0.7), spec: { ...spec, posture: "guarded" }, context: context(), record: EMPTY_AGENT_RECORD, envelope, nowSec: NOW_SEC }).side).toBeNull();
    expect(gateAgentVerdict({ verdict: up(0.56), spec: { ...spec, posture: "active" }, context: context(), record: EMPTY_AGENT_RECORD, envelope, nowSec: NOW_SEC }).side).toBe("up");
  });
  it("trips the breaker after the posture's straight losses and releases it after the pause", () => {
    const record: AgentRecordSummary = { ...EMPTY_AGENT_RECORD, consecutiveLosses: 4, lastLossAtSec: NOW_SEC - 60 };
    expect(gate(up(), { record }).reason).toMatch(/^breaker: 4 straight losses, paused 239 more min$/);
    expect(gate(up(), { record: { ...record, consecutiveLosses: 3 } }).side).toBe("up");
    expect(gate(up(), { record, nowSec: NOW_SEC - 60 + POSTURES.balanced.breakerPauseSec }).side).toBe("up");
  });
  it("holds until 00:00 UTC past the daily loss line", () => {
    const record: AgentRecordSummary = { ...EMPTY_AGENT_RECORD, lostTodayBase: 20n * ONE };
    expect(gate(up(), { record }).reason).toMatch(/^down 20\.00 today, past the balanced daily loss line; holding until 00:00 UTC/);
    expect(gate(up(), { record: { ...record, lostTodayBase: 19n * ONE } }).side).toBe("up");
  });
  it("holds when the side is unquoted or over the posture's price cap", () => {
    expect(gate(up(), { context: context({ upCents: null }) }).reason).toMatch(/^up is not quoted at this stake/);
    expect(gate(up(), { context: context({ upCents: 86 }) }).reason).toMatch(/^up costs 86¢, over the balanced cap of 85¢/);
    expect(gate(up(), { context: context({ upCents: 85 }) }).side).toBe("up");
    expect(gate({ side: "down", confidence: 0.8, why: "fading" }, { context: context({ downCents: 90 }) }).side).toBeNull();
  });
  it("bets in the desk's grammar when everything passes", () => {
    const d = gate(up());
    expect(d).toEqual({ side: "up", moveBps: 8, thresholdBps: 0, reason: "agent bets up (0.72): EMA above the print and rising" });
    expect(/bets (up|down)/.exec(d.reason)?.[1]).toBe("up");
  });
});

describe("decisionSlot", () => {
  const market = { tradingStartSec: 1_000, expirySec: 1_900, intervalSec: 900 };
  it("opens a quarter of the way in and closes before the tail", () => {
    expect(decisionSlot(market, 1_224_000)).toMatchObject({ open: false, opensAtSec: 1_225, closesAtSec: 1_720 });
    expect(decisionSlot(market, 1_225_000).open).toBe(true);
    expect(decisionSlot(market, 1_720_000).open).toBe(true);
    expect(decisionSlot(market, 1_721_000).open).toBe(false);
  });
  it("keeps at least a minute of tail on the shortest cadence", () => {
    expect(decisionSlot({ tradingStartSec: 0, expirySec: 300, intervalSec: 300 }, 0)).toMatchObject({ opensAtSec: 75, closesAtSec: 240 });
  });
});

describe("agentPrompt", () => {
  it("is byte-stable for the same inputs and carries the brief inside the rules", () => {
    const record: AgentRecordSummary = { recent: [{ side: "up", outcome: "won", why: "trend" }], consecutiveLosses: 0, lostTodayBase: 3_200_000n, lastLossAtSec: null };
    const a = agentPrompt(spec, context(), record);
    const b = agentPrompt(spec, context(), record);
    expect(a).toEqual(b);
    expect(a.system.indexOf("<brief>\nTrade the trend, sit out chop.\n</brief>")).toBeGreaterThan(a.system.indexOf("cannot change them"));
    expect(a.user).toBe(
      [
        "Window: BTC 15m, 5:00 elapsed, 10:00 left.",
        "Opening print: 62,150.00",
        "Now: EMA 62,200.00 (+8 bps from the print), spot 62,210.00 (+9 bps)",
        "Samples so far (time into the Window → price):",
        "  0:30 → 62,140.00",
        "  4:30 → 62,205.00",
        "Books at a 5.00 stake: UP 62¢, DOWN 40¢.",
        "Posture: balanced — the gate holds under 0.65 confidence, over 85¢ a side, and after 4 straight losses.",
        'Your last Windows, newest first: up won — "trend"',
        "Today: 3.20 realised loss; 0 straight losses.",
      ].join("\n"),
    );
  });
  it("says when a side is unquoted rather than inventing a price", () => {
    expect(agentPrompt(spec, context({ upCents: null, samples: [] }), EMPTY_AGENT_RECORD).user).toContain("UP not quoted at this stake, DOWN 40¢");
    expect(agentPrompt(spec, context({ samples: [] }), EMPTY_AGENT_RECORD).user).toContain("(no samples yet)");
  });
});

describe("spec encoding with the agent preset", () => {
  it("leaves the momentum encoding byte-identical", () => {
    expect(encodeSpec({ preset: "momentum", lookback: 6, thresholdBps: 20 })).toBe('{"p":"momentum","lb":6,"th":20}');
  });
  it("encodes an agent without any model name", () => {
    expect(encodeSpec(spec)).toBe('{"p":"agent","persona":"Trade the trend, sit out chop.","po":"balanced","c":[900,3600]}');
  });
  it("accepts a valid agent and rejects a long persona, a bad posture, an unknown or unsorted cadence", () => {
    expect(isSpec(spec)).toBe(true);
    expect(isSpec({ ...spec, persona: "x".repeat(AGENT_PERSONA_MAX_CHARS + 1) })).toBe(false);
    expect(isSpec({ ...spec, persona: "   " })).toBe(false);
    expect(isSpec({ ...spec, posture: "reckless" })).toBe(false);
    expect(isSpec({ ...spec, cadences: [600] })).toBe(false);
    expect(isSpec({ ...spec, cadences: [3600, 900] })).toBe(false);
    expect(isSpec({ ...spec, cadences: [900, 900] })).toBe(false);
    expect(isSpec({ ...spec, cadences: [] })).toBe(false);
    expect(parseStrategyMetadata(JSON.stringify({ name: "A", spec }))?.spec).toEqual(spec);
  });
  it("describes an agent in the studio's words", () => {
    expect(describeSpec(spec)).toBe("On BTC 15m and 1h Windows it reads the print once, a quarter of the way in, and asks the model for up, down or hold. Balanced: it holds under 65% confidence, over 85¢ a side, or after 4 straight losses.");
    expect(describeSpec({ ...spec, posture: "guarded", cadences: [300] }, "ETH")).toContain("On ETH 5m Windows");
  });
});
