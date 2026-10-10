import "server-only";
/**
 * Which model answers as Sensei (S13 step 8; plan: "the brain, MPP or a direct key"). The brain's resolver is shared
 * with ops' agents: a key (`ANTHROPIC_API_KEY`, …), the AI Gateway, or an OpenAI-shaped endpoint. `SENSEI_VIA=mpp`
 * pays each question on Tempo instead, through the MPP payer (`MPP_PAYER_PRIVATE_KEY` + `MPP_ROOT_ADDRESS`; mainnet
 * only after Q-020), every payment an `mpp_receipts` row scoped to the question. Nothing here reaches the browser.
 */
import { DEFAULT_AI_MODEL, resolveModel, type ResolvedModel } from "@cwf/brain";
import { insertMppReceipt } from "@cwf/db";
import { mppPayerFromEnv } from "@cwf/markets/server";
import { db } from "@/server/db";

/** Who receives the question, named for the consent. */
const PROVIDER_NAME: Record<string, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI", google: "Google (Gemini)" };

export interface SenseiModel {
  resolved: ResolvedModel;
  /** The parties that receive the text, in order (the consent shows them). */
  recipients: string[];
}

let payer: ReturnType<typeof mppPayerFromEnv> | null = null;

function mppFetch(): typeof globalThis.fetch | null {
  payer ??= mppPayerFromEnv((row) => insertMppReceipt(db(), row).then(() => undefined));
  return payer.payer ? (payer.payer.fetch as typeof globalThis.fetch) : null;
}

export function senseiModel(): SenseiModel | null {
  const spec = process.env.SENSEI_MODEL?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  if (process.env.SENSEI_VIA?.trim() === "mpp") {
    const fetch = mppFetch();
    const resolved = fetch ? resolveModel({ via: "mpp", fetch, spec }) : null;
    return resolved ? { resolved, recipients: [`${PROVIDER_NAME[resolved.providerName] ?? resolved.providerName}, through its Tempo payments host`] } : null;
  }
  const resolved = resolveModel({ spec });
  if (!resolved) return null;
  const provider = PROVIDER_NAME[resolved.providerName] ?? resolved.providerName;
  const recipients =
    resolved.via === "gateway" ? ["Vercel AI Gateway", provider] : resolved.via === "custom-endpoint" ? [`the model endpoint at ${new URL(process.env.AI_BASE_URL!).host}`] : [provider];
  return { resolved, recipients };
}
