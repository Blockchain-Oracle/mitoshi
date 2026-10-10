import { APICallError } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SENSEI_CONSENT_VERSION, takeEvents } from "@/features/sensei/stream";

vi.mock("server-only", () => ({}));
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 4, text: 4, reasoning: undefined } };
let model: MockLanguageModelV4;
vi.mock("@/features/sensei/model.server", () => ({ senseiModel: () => ({ resolved: { model, via: "direct", providerName: "anthropic", modelId: "claude-opus-5-5" }, recipients: ["Anthropic (Claude)"] }) }));

const { POST } = await import("./route");
const ask = (provider = "anthropic", ip = String(Math.random())) =>
  POST(new Request("http://x/api/sensei", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ messages: [{ role: "user", content: "Read this Window" }], consent: { version: SENSEI_CONSENT_VERSION, provider }, snapshot: null, restless: false }) }));
const events = async (res: Response) => takeEvents(await res.text()).events;
const streaming = (chunks: unknown[]) => new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: chunks as never[] }) }) });

describe("POST /api/sensei", () => {
  beforeEach(() => {
    model = streaming([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "UP. " },
      { type: "text-delta", id: "t", delta: "The line holds." },
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: "stop", raw: "end_turn" }, usage },
    ]);
  });

  it("streams the answer token by token, then done", async () => {
    const res = await ask();
    expect(res.headers.get("content-type")).toContain("ndjson");
    expect(await events(res)).toEqual([{ t: "delta", v: "UP. " }, { t: "delta", v: "The line holds." }, { t: "done" }]);
    // The figures ride in their own first turn; the stable prompt is the system message.
    const call = model.doStreamCalls[0]!;
    expect(call.prompt[0]).toMatchObject({ role: "system" });
    expect(JSON.stringify(call.prompt[1])).toContain("No live Window was provided this turn");
  });

  it("refuses a question agreed for another provider before any call", async () => {
    const res = await ask("openai");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("provider changed");
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("says a rejected credential is a configuration problem", async () => {
    model = new MockLanguageModelV4({ doStream: async () => { throw new APICallError({ message: "invalid x-api-key", url: "https://api.anthropic.com/v1/messages", requestBodyValues: {}, statusCode: 401, isRetryable: false }); } });
    expect(await events(await ask())).toEqual([{ t: "error", m: "Sensei's anthropic credential was rejected. That's a configuration problem, not you." }]);
  });

  it("turns a refusal with nothing written into Sensei's words", async () => {
    model = streaming([{ type: "finish", finishReason: { unified: "content-filter", raw: "refusal" }, usage }]);
    expect(await events(await ask())).toEqual([{ t: "error", m: "Sensei can't answer that one. Ask about a Window instead." }]);
  });

  it("holds a second question from the same address inside 3 s", async () => {
    await (await ask("anthropic", "10.0.0.9")).text();
    expect((await ask("anthropic", "10.0.0.9")).status).toBe(429);
  });
});
