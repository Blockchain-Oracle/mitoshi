// Ported from Masayume 68f7a09:packages/brain/src/agent-decide.ts
import { agentPrompt, gateAgentVerdict, type AgentContext, type AgentPrompt, type AgentRecordSummary, type AgentSpec, type Decision } from "@cwf/core/strategies";
import type { VaultCaps } from "@cwf/core/vault";
import type { LanguageModel } from "ai";
import { createHash } from "node:crypto";
import { readAgentVerdict, type AgentRead } from "./agent-read";

export interface DecideAgentWindowInput {
  spec: AgentSpec;
  context: AgentContext;
  record: AgentRecordSummary;
  envelope: VaultCaps;
  nowSec: number;
  model: LanguageModel;
  timeoutMs?: number;
}

export interface AgentWindowDecision {
  prompt: AgentPrompt;
  /** sha256 of the exact bytes the model saw, so a decision row can be tied to its prompt. */
  promptHash: string;
  read: AgentRead;
  decision: Decision;
}

export function promptHashOf(prompt: AgentPrompt): string {
  return createHash("sha256").update(prompt.system).update("\n\n").update(prompt.user).digest("hex");
}

/**
 * The one function the runner and the studio's dry read both call: build the prompt, read the model once, gate the
 * verdict. The gate is pure and runs whether or not the read succeeded. The runner wraps this call in
 * `withReceiptScope({ decisionId })` so an MPP-paid read is recorded against the decision it produced.
 */
export async function decideAgentWindow(input: DecideAgentWindowInput): Promise<AgentWindowDecision> {
  const { spec, context, record, envelope, nowSec, model, timeoutMs } = input;
  const prompt = agentPrompt(spec, context, record);
  const read = await readAgentVerdict({ model, prompt, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
  const decision = gateAgentVerdict({
    verdict: read.ok ? read.verdict : null,
    ...(read.ok ? {} : { failure: `${read.failure} — ${read.detail}` }),
    spec,
    context,
    record,
    envelope,
    nowSec,
  });
  return { prompt, promptHash: promptHashOf(prompt), read, decision };
}
