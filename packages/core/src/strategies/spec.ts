// Ported from Masayume 68f7a09:packages/core/src/strategies/spec.ts
// + Agari 03b30ab:packages/core/src/strategies/spec.ts (the `mirror` preset; a Tempo address, not base58).
import { AGENT_CADENCES_SEC, AGENT_PERSONA_MAX_CHARS, AGENT_POSTURES, describeAgentSpec } from "./agent";
import type { AgentSpec, MirrorSpec, OracleFollowSpec, PresetKey, StrategyMetadata, StrategySpec } from "./types";

/** The presets, in the reference's words (`lib/sui/strategyClient.ts` PRESETS), plus the agent. */
export const PRESETS: Record<PresetKey, { name: string; tagline: string; how: string }> = {
  momentum: {
    name: "Momentum",
    tagline: "Follow the trend",
    how: "Compares the price with the Window's opening print. Once it has risen past the threshold it bets UP, and DOWN once it has fallen. It rides whichever way price is already going.",
  },
  reversion: {
    name: "Mean-reversion",
    tagline: "Fade the move",
    how: "The opposite instinct. Once the price has run up past the threshold from the Window's opening print it bets DOWN, expecting a pullback; after a sharp drop it bets UP. It bets against the move.",
  },
  agent: {
    name: "AI agent",
    tagline: "Reads, then decides",
    how: "Reads each Window once — the print, the move so far, both books — and asks a language model for up, down or hold. A fixed gate then holds any weak call.",
  },
  mirror: {
    name: "Mirror a trader",
    tagline: "Copy one wallet",
    how: "Watches one wallet's own calls. When it takes a side on a live Window, this takes the same side — after them, at the book's price then.",
  },
};

/** A copy that chases a call older than a Window's own life is copying nothing; a few seconds is too jumpy to fill. */
export const MIRROR_WITHIN_MIN_SEC = 30;
export const MIRROR_WITHIN_MAX_SEC = 3_600;

export const LOOKBACK_MIN = 2;
export const LOOKBACK_MAX = 12;

/** Plain-language description of exactly what the runner will do with this spec (reference `describeSpec`). */
export function describeSpec(s: StrategySpec, asset = "BTC"): string {
  if (s.preset === "agent") return describeAgentSpec(s, asset);
  if (s.preset === "mirror") return `Every round it reads what ${shortTrader(s.trader)} did on each live Window. If that wallet took a side in the last ${s.withinSec} seconds and is still net on it, this takes the same side. Your order lands after theirs, at the book's price then.`;
  const dir = s.preset === "momentum" ? "with" : "against";
  const pct = (s.thresholdBps / 100).toFixed(2).replace(/\.?0+$/, "");
  // The Window settles against its opening print, so that print is the reference (Masayume's model); the lookback is
  // only for a Window with no print, which a trading Window on Tempo never is.
  return `Every round it compares ${asset}'s price with the Window's opening print. Once it has moved at least ${pct}%, it bets ${dir} that move. Otherwise it sits out.`;
}

/**
 * Compact, deterministic serialization — what `specHash` is taken over (reference `encodeSpec`).
 * The momentum/reversion branch is byte-identical to the first release, so no published hash moves.
 */
export function encodeSpec(s: StrategySpec): string {
  if (s.preset === "mirror") return JSON.stringify({ p: "mirror", t: s.trader.toLowerCase(), w: s.withinSec });
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

/** Enough of an address to recognise, in the app's own style. */
export function shortTrader(trader: string): string {
  return `${trader.slice(0, 6)}…${trader.slice(-4)}`;
}

function isMirrorSpec(v: Record<string, unknown>): v is MirrorSpec & Record<string, unknown> {
  return (
    v.preset === "mirror" &&
    typeof v.trader === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(v.trader) &&
    !/^0x0{40}$/i.test(v.trader) &&
    typeof v.withinSec === "number" &&
    Number.isInteger(v.withinSec) &&
    v.withinSec >= MIRROR_WITHIN_MIN_SEC &&
    v.withinSec <= MIRROR_WITHIN_MAX_SEC
  );
}

export function isSpec(value: unknown): value is StrategySpec {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return isOracleFollowSpec(v) || isAgentSpec(v) || isMirrorSpec(v);
}

/** The longest portrait seed a strategy's metadata keeps (Owarine's bound). */
export const PORTRAIT_SEED_MAX = 128;

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
      ...(typeof v.portraitSeed === "string" && v.portraitSeed.length > 0 && v.portraitSeed.length <= PORTRAIT_SEED_MAX ? { portraitSeed: v.portraitSeed } : {}),
    };
  } catch {
    return null;
  }
}
