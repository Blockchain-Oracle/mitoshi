import { generateText } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { defaultModelSpec, missingCredentialHint, resolveModel } from "./model";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("resolveModel via mpp", () => {
  it("routes the provider to its MPP host through the payer's fetch, with no provider key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const seen: { url: string; headers: Headers }[] = [];
    // Captures the outgoing request only; the payment itself is exercised live by scripts/mpp/pay.ts.
    const payerFetch: typeof fetch = async (input, init) => {
      seen.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } });
    };
    const resolved = resolveModel({ via: "mpp", fetch: payerFetch, spec: "anthropic/claude-opus-5" });
    expect(resolved).toMatchObject({ via: "mpp", providerName: "anthropic", modelId: "claude-opus-5" });
    const out = await generateText({ model: resolved!.model, prompt: "hi" });
    expect(out.text).toBe("ok");
    expect(seen[0]!.url).toBe("https://anthropic.mpp.tempo.xyz/v1/messages");
  });
  it("returns null without a fetch or for an unknown provider, and says what is missing", () => {
    expect(resolveModel({ via: "mpp", spec: "anthropic/claude-opus-5" })).toBeNull();
    expect(resolveModel({ via: "mpp", fetch, spec: "mistral/large" })).toBeNull();
    expect(missingCredentialHint({ via: "mpp", spec: "mistral/large" })).toMatch(/no MPP host/);
  });
  it("keeps the key routes when via is omitted", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    expect(resolveModel({ spec: "anthropic/claude-opus-5" })?.via).toBe("direct");
  });
  it("does not let a provider key on the box choose the paid model", () => {
    for (const k of ["AI_MODEL", "ANTHROPIC_API_KEY"]) delete process.env[k];
    process.env.OPENAI_API_KEY = "k";
    expect(resolveModel({ via: "mpp", fetch })).toMatchObject({ providerName: "anthropic", modelId: "claude-opus-5-5" });
  });
});

describe("resolveModel with no AI_MODEL", () => {
  const clear = () => {
    for (const k of ["AI_MODEL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "AI_GATEWAY_API_KEY", "AI_BASE_URL", "AI_API_KEY"]) delete process.env[k];
  };
  it("takes the default model of whichever provider key is set", () => {
    clear();
    process.env.OPENAI_API_KEY = "k";
    expect(defaultModelSpec()).toBe("openai/gpt-6-sol");
    expect(resolveModel()).toMatchObject({ via: "direct", providerName: "openai", modelId: "gpt-6-sol" });
  });
  it("prefers Claude when both keys are set, and AI_MODEL over either", () => {
    clear();
    process.env.OPENAI_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "k";
    expect(resolveModel()).toMatchObject({ providerName: "anthropic", modelId: "claude-opus-5-5" });
    process.env.AI_MODEL = "openai/gpt-6-luna";
    expect(resolveModel()).toMatchObject({ providerName: "openai", modelId: "gpt-6-luna" });
  });
  it("returns null with no credential and names every key that would do", () => {
    clear();
    expect(resolveModel()).toBeNull();
    expect(missingCredentialHint()).toBe("ANTHROPIC_API_KEY or OPENAI_API_KEY (either one), or AI_GATEWAY_API_KEY");
    process.env.AI_MODEL = "openai/gpt-6-sol";
    expect(missingCredentialHint()).toBe("OPENAI_API_KEY (for openai/gpt-6-sol), or AI_GATEWAY_API_KEY");
  });
});
