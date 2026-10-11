// Ported from Masayume 68f7a09:packages/brain/src/model.ts (+ the `via: 'mpp'` route, plan C.5.3 / D-033)
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Which model answers — server only.
 *
 * A model is resolved from configuration through the AI SDK's uniform interface, so Claude, GPT, Gemini or anything
 * speaking the OpenAI protocol are the same call with a different string:
 *
 *   AI_MODEL="anthropic/claude-opus-5-5" (the default)
 *   AI_MODEL="openai/gpt-6-sol"
 *   AI_MODEL="google/gemini-3-5-flash"
 *
 * Without `AI_MODEL`, a provider key alone is enough: the model is that provider's default (`PROVIDER_DEFAULT_MODELS`),
 * Claude first when both keys are set.
 *
 * Routes, in order:
 *
 *   0. `via: 'mpp'` → the provider's MPP host (`anthropic.mpp.tempo.xyz`, …) with the MPP payer's `fetch`: no API key,
 *      each request paid in stablecoins on Tempo and recorded as a receipt (`@cwf/markets/server` `createMppPayer`,
 *      receipts scoped by `withReceiptScope`). The brain never holds a key or signs: it only receives `fetch`.
 *   1. AI_BASE_URL + AI_API_KEY  → any OpenAI-compatible endpoint (OpenRouter, Together, Groq, vLLM, Ollama).
 *   2. the named provider's own key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY).
 *   3. AI_GATEWAY_API_KEY → Vercel's AI Gateway with the whole `creator/model` string.
 *   4. nothing → `null`, and the caller says so.
 *
 * What this trades away: provider-specific features no portable interface exposes (server-side refusal fallbacks,
 * explicit `cache_control`, adaptive thinking's `display`). Reasoning effort stays portable in AI SDK 7.
 */

/** Claude stays the default. It is the best model for this job; the point is that it is now a setting. */
export const DEFAULT_AI_MODEL = "anthropic/claude-opus-5-5";

/**
 * The model a provider's key answers with when `AI_MODEL` is unset, in preference order. `gpt-6-sol` was chosen on
 * 2026-10-11 by running the agent read through gpt-5-nano, gpt-6-luna, gpt-6-sol and gpt-6.1-sol on the same Window:
 * the fastest median (3.1 s) and the reasons most tied to the figures (D-221).
 */
export const PROVIDER_DEFAULT_MODELS: readonly { keyEnv: string; spec: string }[] = [
  { keyEnv: "ANTHROPIC_API_KEY", spec: DEFAULT_AI_MODEL },
  { keyEnv: "OPENAI_API_KEY", spec: "openai/gpt-6-sol" },
];

type Factory = (modelId: string) => LanguageModel;

interface DirectProvider {
  keyEnv: string;
  create: (apiKey: string) => Factory;
}

const DIRECT: Record<string, DirectProvider> = {
  anthropic: { keyEnv: "ANTHROPIC_API_KEY", create: (apiKey) => createAnthropic({ apiKey }) },
  openai: { keyEnv: "OPENAI_API_KEY", create: (apiKey) => createOpenAI({ apiKey }) },
  google: { keyEnv: "GOOGLE_GENERATIVE_AI_API_KEY", create: (apiKey) => createGoogleGenerativeAI({ apiKey }) },
};

/**
 * The MPP hosts per provider (mpp.dev/services; spike X10 probed anthropic and openai: both answer 402 with charge and
 * session offers). The key is a placeholder the hosts ignore — payment is the credential.
 */
export const MPP_MODEL_HOSTS: Record<string, { baseURL: string; create: (baseURL: string, fetch: typeof globalThis.fetch) => Factory }> = {
  anthropic: { baseURL: "https://anthropic.mpp.tempo.xyz/v1", create: (baseURL, fetch) => createAnthropic({ baseURL, apiKey: "mpp", fetch }) },
  openai: { baseURL: "https://openai.mpp.tempo.xyz/v1", create: (baseURL, fetch) => createOpenAI({ baseURL, apiKey: "mpp", fetch }) },
  google: { baseURL: "https://gemini.mpp.tempo.xyz/v1beta", create: (baseURL, fetch) => createGoogleGenerativeAI({ baseURL, apiKey: "mpp", fetch }) },
};

export interface ResolvedModel {
  model: LanguageModel;
  /** How the model was reached, for the logs and the health probe. Never a key. */
  via: "mpp" | "custom-endpoint" | "direct" | "gateway";
  providerName: string;
  modelId: string;
}

export interface ResolveModelOptions {
  /** `'mpp'` pays each call through `fetch` (required then); omitted = the key-based routes. */
  via?: "mpp";
  /** The MPP payer's payment-aware fetch (`createMppPayer(...).fetch`). */
  fetch?: typeof globalThis.fetch;
  /** Overrides `AI_MODEL`. */
  spec?: string;
}

/** Splits `creator/model` once, so a model id containing further slashes survives. */
function split(spec: string): { providerName: string; modelId: string } {
  const at = spec.indexOf("/");
  return at === -1 ? { providerName: "", modelId: spec } : { providerName: spec.slice(0, at), modelId: spec.slice(at + 1) };
}

/**
 * `AI_MODEL` when set; otherwise the default of the first provider whose key is set, so any one key switches the brain
 * on; otherwise `DEFAULT_AI_MODEL` (what the gateway and an MPP host receive whole).
 */
export function defaultModelSpec(env: NodeJS.ProcessEnv = process.env): string {
  return env.AI_MODEL?.trim() || PROVIDER_DEFAULT_MODELS.find((p) => env[p.keyEnv]?.trim())?.spec || DEFAULT_AI_MODEL;
}

/** An MPP route pays per call, so a key on the box does not choose its model: `AI_MODEL` or the default. */
function specOf(options: ResolveModelOptions): string {
  return options.spec?.trim() || (options.via === "mpp" ? process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL : defaultModelSpec());
}

export function resolveModel(options: ResolveModelOptions = {}): ResolvedModel | null {
  const spec = specOf(options);
  const { providerName, modelId } = split(spec);

  if (options.via === "mpp") {
    const host = MPP_MODEL_HOSTS[providerName];
    if (!host || !options.fetch) return null;
    return { model: host.create(host.baseURL, options.fetch)(modelId), via: "mpp", providerName, modelId };
  }

  const baseURL = process.env.AI_BASE_URL?.trim();
  const customKey = process.env.AI_API_KEY?.trim();
  if (baseURL && customKey) {
    // Anything OpenAI-shaped. The model id is passed whole — these endpoints expect their own naming.
    return { model: createOpenAI({ apiKey: customKey, baseURL })(spec), via: "custom-endpoint", providerName: providerName || "custom", modelId: spec };
  }

  const direct = DIRECT[providerName];
  const directKey = direct ? process.env[direct.keyEnv]?.trim() : undefined;
  if (direct && directKey) {
    return { model: direct.create(directKey)(modelId), via: "direct", providerName, modelId };
  }

  if (process.env.AI_GATEWAY_API_KEY?.trim()) {
    // A bare `creator/model` string is a valid LanguageModel: the SDK routes it through the Gateway.
    return { model: spec, via: "gateway", providerName, modelId };
  }

  return null;
}

/** What is missing, said precisely enough to fix without reading the code. */
export function missingCredentialHint(options: ResolveModelOptions = {}): string {
  const spec = specOf(options);
  const { providerName } = split(spec);
  if (options.via === "mpp") {
    return MPP_MODEL_HOSTS[providerName]
      ? `an MPP payer fetch (MPP_PAYER_PRIVATE_KEY + MPP_ROOT_ADDRESS, Q-020 on mainnet) for ${spec}`
      : `no MPP host for provider "${providerName}" (known: ${Object.keys(MPP_MODEL_HOSTS).join(", ")})`;
  }
  // No model named: any provider key will do.
  if (!options.spec?.trim() && !process.env.AI_MODEL?.trim()) return `${PROVIDER_DEFAULT_MODELS.map((p) => p.keyEnv).join(" or ")} (either one), or AI_GATEWAY_API_KEY`;
  const direct = DIRECT[providerName];
  return direct ? `${direct.keyEnv} (for ${spec}), or AI_GATEWAY_API_KEY` : `AI_GATEWAY_API_KEY (for ${spec}), or AI_BASE_URL + AI_API_KEY`;
}
