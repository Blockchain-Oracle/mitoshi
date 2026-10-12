// Ported from Masayume 68f7a09:packages/brain/src/agent-read.ts (`generateObject` → `generateText` + `Output.object`, AI SDK 7)
import { agentVerdictSchema, type AgentPrompt, type AgentReadFailure, type AgentVerdict } from "@cwf/core/strategies";
import { APICallError, generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output, type LanguageModel } from "ai";

export const DEFAULT_AGENT_TIMEOUT_MS = 20_000;
/** A verdict is three fields; the budget covers the model's reasoning tokens on top of them. */
const MAX_OUTPUT_TOKENS = 1024;
/** A market read is short and latency-sensitive: portable low effort, mapped by each provider onto its own knob. */
const REASONING = "low" as const;
const MAX_RETRIES = 1;

export type AgentRead = { ok: true; verdict: AgentVerdict; modelId: string } | { ok: false; failure: AgentReadFailure; detail: string };

export interface ReadAgentVerdictInput {
  model: LanguageModel;
  prompt: AgentPrompt;
  timeoutMs?: number;
}

/** `creator/model` for a string model, `provider/modelId` for an instance — never a key. */
export function modelLabel(model: LanguageModel): string {
  return typeof model === "string" ? model : `${model.provider}/${model.modelId}`;
}

class ReadTimeout extends Error {
  override readonly name = "TimeoutError";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Every failure names itself; none of them becomes a verdict. */
function classify(error: unknown, timeoutMs: number): { failure: AgentReadFailure; detail: string } {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return { failure: "timeout", detail: `no answer within ${timeoutMs} ms` };
  if (NoObjectGeneratedError.isInstance(error)) {
    if (error.finishReason === "content-filter") return { failure: "refusal", detail: "the model declined to answer" };
    return { failure: "parse", detail: `the answer was not a {side, confidence, why} object${error.finishReason ? ` (finished: ${error.finishReason})` : ""}` };
  }
  if (NoOutputGeneratedError.isInstance(error)) return { failure: "parse", detail: "the model finished without an answer" };
  if (APICallError.isInstance(error)) return { failure: "upstream", detail: error.statusCode ? `provider answered ${error.statusCode}` : messageOf(error) };
  return { failure: "upstream", detail: messageOf(error) };
}

/**
 * The deadline is the read's own, not the provider's: the signal is passed down so a well-behaved transport stops
 * early, and the race guarantees the hold even when one does not.
 */
async function withDeadline<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ReadTimeout(`no answer within ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One structured read: the model answers the verdict schema or the read fails closed. A failure is a failure — the
 * gate turns it into a hold with the failure named, never into a guessed call. The recorded model is
 * `provider/<id the provider reported>`, so a row says exactly which version answered. When the model is reached
 * `via: 'mpp'`, the payment for this read lands in `mpp_receipts` under the caller's `withReceiptScope`.
 */
export async function readAgentVerdict({ model, prompt, timeoutMs = DEFAULT_AGENT_TIMEOUT_MS }: ReadAgentVerdictInput): Promise<AgentRead> {
  const label = modelLabel(model);
  try {
    const result = await withDeadline(timeoutMs, (abortSignal) =>
      generateText({
        model,
        output: Output.object({ schema: agentVerdictSchema }),
        system: prompt.system,
        prompt: prompt.user,
        reasoning: REASONING,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: MAX_RETRIES,
        abortSignal,
      }),
    );
    const verdict = agentVerdictSchema.parse(result.output);
    // `openai.responses` → `openai`: the SDK's provider id names its API too; a row names the creator, as AI_MODEL does.
    const provider = label.slice(0, label.indexOf("/")).split(".")[0];
    const answered = result.response.modelId;
    return { ok: true, verdict, modelId: answered && provider ? `${provider}/${answered}` : label };
  } catch (error) {
    return { ok: false, ...classify(error, timeoutMs) };
  }
}
