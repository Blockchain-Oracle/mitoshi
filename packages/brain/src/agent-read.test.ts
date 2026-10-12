// Ported from Masayume 68f7a09:packages/brain/src/agent-read.test.ts (V4 mock for AI SDK 7's `generateText` + `Output`)
import { EMPTY_AGENT_RECORD, type AgentContext, type AgentSpec } from "@cwf/core/strategies";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { decideAgentWindow, promptHashOf } from "./agent-decide";
import { modelLabel, readAgentVerdict } from "./agent-read";

const ONE = 1_000_000n;
const FEED = 100_000_000n;
const NOW_SEC = 1_788_400_000;
const spec: AgentSpec = { preset: "agent", persona: "Follow the trend.", posture: "balanced", cadences: [900] };
const envelope = { maxStakePerTradeBase: 5n * ONE, maxDailySpendBase: 50n * ONE, maxOpenPositions: 2, maxPriceRaw: 0n, market: null };
const context: AgentContext = {
  asset: "BTC",
  intervalSec: 900,
  tradingStartSec: NOW_SEC - 300,
  openingRaw: 62_150n * FEED,
  emaRaw: 62_200n * FEED,
  spotRaw: 62_210n * FEED,
  feedDecimals: 8,
  samples: [],
  upCents: 62,
  downCents: 40,
  stakeBase: 5n * ONE,
  collateralDecimals: 6,
  elapsedSec: 300,
  leftSec: 600,
};

/** A model that answers with exactly this text (a unit-level stand-in for a provider's reply; no network). */
function answering(text: string, finish: "stop" | "content-filter" = "stop"): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId: "mock-reader",
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: finish, raw: undefined },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } },
      warnings: [],
    }),
  } as never);
}

describe("readAgentVerdict", () => {
  it("returns the verdict and the model it came from", async () => {
    const read = await readAgentVerdict({ model: answering('{"side":"up","confidence":0.72,"why":"EMA above the print"}'), prompt: { system: "s", user: "u" } });
    expect(read).toEqual({ ok: true, verdict: { side: "up", confidence: 0.72, why: "EMA above the print" }, modelId: "mock-provider/mock-reader" });
  });
  it("names the creator, not the SDK's API id (`openai.responses` → `openai`)", async () => {
    const model = answering('{"side":"hold","confidence":0.4,"why":"thin"}');
    Object.defineProperty(model, "provider", { value: "openai.responses" });
    expect(await readAgentVerdict({ model, prompt: { system: "s", user: "u" } })).toMatchObject({ ok: true, modelId: "openai/mock-reader" });
  });
  it("fails closed on prose, on an off-schema object and on a refusal — never a guessed verdict", async () => {
    const prompt = { system: "s", user: "u" };
    expect(await readAgentVerdict({ model: answering("Looks bullish, I would go up."), prompt })).toMatchObject({ ok: false, failure: "parse" });
    expect(await readAgentVerdict({ model: answering('{"side":"long","confidence":2,"why":""}'), prompt })).toMatchObject({ ok: false, failure: "parse" });
    expect((await readAgentVerdict({ model: answering("", "content-filter"), prompt })).ok).toBe(false);
  });
  it("names a timeout", async () => {
    const slow = new MockLanguageModelV4({ doGenerate: () => new Promise(() => undefined) } as never);
    expect(await readAgentVerdict({ model: slow, prompt: { system: "s", user: "u" }, timeoutMs: 20 })).toEqual({ ok: false, failure: "timeout", detail: "no answer within 20 ms" });
  });
  it("labels a string model as the gateway would", () => {
    expect(modelLabel("anthropic/claude-opus-5")).toBe("anthropic/claude-opus-5");
  });
});

describe("decideAgentWindow", () => {
  it("gates a good read into a bet and a bad read into a hold that names the failure", async () => {
    const traded = await decideAgentWindow({ spec, context, record: EMPTY_AGENT_RECORD, envelope, nowSec: NOW_SEC, model: answering('{"side":"up","confidence":0.72,"why":"EMA above the print"}') });
    expect(traded.decision).toMatchObject({ side: "up", reason: "agent bets up (0.72): EMA above the print" });
    expect(traded.promptHash).toBe(promptHashOf(traded.prompt));
    expect(traded.promptHash).toMatch(/^[0-9a-f]{64}$/);

    const held = await decideAgentWindow({ spec, context, record: EMPTY_AGENT_RECORD, envelope, nowSec: NOW_SEC, model: answering("not json") });
    expect(held.decision.side).toBeNull();
    expect(held.decision.reason).toMatch(/^model unavailable: parse — /);
    expect(held.promptHash).toBe(traded.promptHash);
  });
});
