// Ported from Masayume 68f7a09:packages/core/src/strategies/spec.ts
import { AGENT_CADENCES_SEC, AGENT_PERSONA_MAX_CHARS, AGENT_POSTURES, describeAgentSpec } from "./agent";
import type { AgentSpec, OracleFollowSpec, PresetKey, StrategyMetadata, StrategySpec } from "./types";

/** The presets, in the reference's words (`lib/sui/strategyClient.ts` PRESETS), plus the agent. */
export const PRESETS: Record<PresetKey, { name: string; tagline: string; how: string }> = {
  momentum: {
    name: "Momentum",
    tagline: "Follow the trend",
    how: "Reads the last few prices. If the market moved up past the threshold it bets UP, and DOWN if it fell. It rides whichever way price is already going.",
  },
  reversion: {
    name: "Mean-reversion",
    tagline: "Fade the move",
    how: "The opposite instinct. If the market ran up past the threshold it bets DOWN, expecting a pullback. After a sharp drop it bets UP. It bets against the last move.",
  },
  agent: {
    name: "AI agent",
    tagline: "Reads, then decides",
    how: "Reads each Window once — the print, the move so far, both books — and asks a language model for up, down or hold. A fixed gate then holds any weak call.",
  },
};

export const LOOKBACK_MIN = 2;
export const LOOKBACK_MAX = 12;

/** Plain-language description of exactly what the runner will do with this spec (reference `describeSpec`). */
export function describeSpec(s: StrategySpec, asset = "BTC"): string {
  if (s.preset === "agent") return describeAgentSpec(s, asset);
  const dir = s.preset === "momentum" ? "with" : "against";
  const pct = (s.thresholdBps / 100).toFixed(2).replace(/\.?0+$/, "");
  return `Every round it reads the last ${s.lookback} prices. If ${asset} moved at least ${pct}%, it bets ${dir} that move. Otherwise it sits out.`;
}

/**
 * Compact, deterministic serialization — what `specHash` is taken over (reference `encodeSpec`).
 * The momentum/reversion branch is byte-identical to the first release, so no published hash moves.
 */
export function encodeSpec(s: StrategySpec): string {
  if (s.preset === "agent") return JSON.stringify({ p: "agent", persona: s.persona, po: s.posture, c: s.cadences });
  return JSON.stringify({ p: s.preset, lb: s.lookback, th: s.thresholdBps });
}

function isOracleFollowSpec(v: Record<string, unknown>): v is OracleFollowSpec & Record<string, unknown> {
  return (
    (v.preset === "momentum" || v.preset === "reversion") &&
    typeof v.lookback === "number" &&
    Number.isInteger(v.lookback) &&
    v.lookback >= LOOKBACK_MIN &&
    v.lookback <= LOOKBACK_MAX &&
    typeof v.thresholdBps === "number" &&
    Number.isInteger(v.thresholdBps) &&
    v.thresholdBps >= 0
  );
}

/** Strictly ascending, so unique by construction, and every cadence one the venue actually runs. */
function isCadenceList(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((c, i) => typeof c === "number" && AGENT_CADENCES_SEC.includes(c) && (i === 0 || c > (value[i - 1] as number)));
}

function isAgentSpec(v: Record<string, unknown>): v is AgentSpec & Record<string, unknown> {
  return (
    v.preset === "agent" &&
    typeof v.persona === "string" &&
    v.persona.trim().length >= 1 &&
    v.persona.length <= AGENT_PERSONA_MAX_CHARS &&
    typeof v.posture === "string" &&
    (AGENT_POSTURES as readonly string[]).includes(v.posture) &&
    isCadenceList(v.cadences)
  );
}

export function isSpec(value: unknown): value is StrategySpec {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return isOracleFollowSpec(v) || isAgentSpec(v);
}

export function encodeStrategyMetadata(meta: StrategyMetadata): string {
  return JSON.stringify(meta);
}

/** Reads the creator's metadata string; a malformed one yields null rather than a guessed strategy. */
export function parseStrategyMetadata(raw: string): StrategyMetadata | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.name !== "string" || !isSpec(v.spec)) return null;
    return {
      name: v.name,
      description: typeof v.description === "string" ? v.description : "",
      spec: v.spec,
      ...(typeof v.playbook === "string" && v.playbook ? { playbook: v.playbook } : {}),
    };
  } catch {
    return null;
  }
}
