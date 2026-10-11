/**
 * The agent scan on a real Postgres store (TEST_DATABASE_URL) with the AI SDK's mock model standing in for the provider
 * (no network): a Window inside its read slot costs one read, reserved and recorded before anything could be sent; the
 * gate decides; a second cycle reuses the recorded trade without asking again; a weak verdict is held. Books and
 * settlements are the scan's injected chain reads.
 */
import postgres from "postgres";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentSpec } from "@cwf/core";
import { createPgStrategyStore, runMigrations } from "@cwf/db";
import type { IndexedStrategy } from "@cwf/db/idx";
import type { RunnerWindow } from "@cwf/markets/ops";
import { samplesOf, scanAgent, type AgentState } from "./agent";

const url = process.env.TEST_DATABASE_URL;
const NOW = 1_791_700_000;
const OPEN = 6_000_000_000_000n;
const SPEC: AgentSpec = { preset: "agent", persona: "A patient desk trader.", posture: "guarded", cadences: [300] };
const window: RunnerWindow = {
  marketId: `0x${"ab".repeat(32)}`, seriesId: `0x${"7c".repeat(32)}`, index: 9n, spotSymbol: "BTC", cadenceSec: 300, tradingStartSec: NOW - 100, lockAtSec: NOW + 170, expirySec: NOW + 200,
  openPriceE8: OPEN, grid: { lotBase: 1_000n, tickBase: 1_000n, cashUnit: 1n, minLots: 1n, decimals: 6 },
};
const strategy = { strategyId: "3", maxStakePerTradeBase: "5000000", maxDailySpendBase: "50000000", maxOpenPositions: 3, maxPriceRaw: "900000" } as IndexedStrategy;
const book = { bids: [[400, 100_000n]] as [number, bigint][], asks: [[550, 100_000n]] as [number, bigint][] };
let calls = 0;
const answering = (text: string) =>
  new MockLanguageModelV4({
    modelId: "mock-reader",
    doGenerate: async () => {
      calls += 1;
      return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } }, warnings: [] };
    },
  } as never);

describe("samplesOf", () => {
  it("takes at most 12 points across the Window so far and an integer EMA over them", () => {
    const at = (sec: number) => ({ priceE8: OPEN + BigInt(sec - (NOW - 100)) * 1_000_000n });
    const { samples, emaE8 } = samplesOf(at, NOW - 100, NOW);
    expect(samples.length).toBeLessThanOrEqual(12);
    expect(samples[0]!.priceRaw).toBeGreaterThan(OPEN);
    expect(emaE8! > samples[0]!.priceRaw && emaE8! <= samples.at(-1)!.priceRaw).toBe(true);
    expect(samplesOf(() => null, NOW - 100, NOW)).toEqual({ samples: [], emaE8: null });
  });
});

describe.skipIf(!url)("scanAgent (real store, mock model)", () => {
  const schema = `t_${Date.now().toString(36)}_a`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  });

  const deps = (state: AgentState) => ({
    books: async () => new Map([[window.marketId.toLowerCase(), book]]),
    settlementOf: async () => null,
    store: createPgStrategyStore(sql),
    runner: "0xca7bfa5cbdc7135ba178ca23cd2b12c123258b9a",
    dryRun: false,
    agent: state,
    log: () => undefined,
    spot: { latest: () => ({ priceE8: OPEN + 12_000_000_000n }), at: () => ({ priceE8: OPEN + 10_000_000_000n }) },
  });

  it("reads once inside the slot, records the decision, and bets when the gate agrees", async () => {
    calls = 0;
    const state: AgentState = { brain: { model: answering('{"side":"up","confidence":0.82,"why":"EMA well above the print; UP still cheap"}'), via: "direct", providerName: "anthropic", modelId: "claude-opus-5-5" }, missing: "", callsAtMs: [], maxPerHour: 60, timeoutMs: 5_000 };
    const scan = await scanAgent(deps(state), strategy, SPEC, [window], NOW * 1000);
    expect(scan.candidates.map((c) => c.decision.side)).toEqual(["up"]);
    expect(calls).toBe(1);
    const row = await createPgStrategyStore(sql).decisionOf("3", window.marketId, false);
    expect(row).toMatchObject({ gate: "trade", side: "up", verdictSide: "up", model: "mock-provider/mock-reader" });
    // The next cycle reuses the recorded trade: no second read for the same Window.
    const again = await scanAgent(deps(state), strategy, SPEC, [window], NOW * 1000 + 30_000);
    expect(again.candidates.map((c) => c.decision.side)).toEqual(["up"]);
    expect(calls).toBe(1);
  });

  it("holds a verdict under the posture's confidence floor, and holds that Window after", async () => {
    calls = 0;
    const other = { ...window, marketId: `0x${"cd".repeat(32)}` as const };
    const state: AgentState = { brain: { model: answering('{"side":"down","confidence":0.5,"why":"mixed"}'), via: "direct", providerName: "anthropic", modelId: "claude-opus-5-5" }, missing: "", callsAtMs: [], maxPerHour: 60, timeoutMs: 5_000 };
    const d = { ...deps(state), books: async () => new Map([[other.marketId, book]]) };
    const scan = await scanAgent(d, strategy, SPEC, [other], NOW * 1000);
    expect(scan.candidates).toEqual([]);
    expect(scan.why).toContain("held");
    expect((await createPgStrategyStore(sql).decisionOf("3", other.marketId, false))?.gate).toBe("held");
  });

  it("names what is missing instead of reading when no brain is configured", async () => {
    const scan = await scanAgent(deps({ brain: null, missing: "ANTHROPIC_API_KEY or OPENAI_API_KEY (either one), or AI_GATEWAY_API_KEY", callsAtMs: [], maxPerHour: 60, timeoutMs: 5_000 }), strategy, SPEC, [window], NOW * 1000);
    expect(scan.why).toBe("agent brain not configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY (either one), or AI_GATEWAY_API_KEY on the runner; holding");
  });
});
