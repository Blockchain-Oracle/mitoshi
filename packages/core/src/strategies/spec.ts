// Ported from Masayume 68f7a09:packages/core/src/strategies/spec.ts
// + Agari 03b30ab:packages/core/src/strategies/spec.ts (the `mirror` preset; a Tempo address, not base58).
// + D-231: the `basket` preset (a theme) — its members, lanes and nested rule (`basket.ts`).
import { AGENT_CADENCES_SEC, AGENT_PERSONA_MAX_CHARS, AGENT_POSTURES, describeAgentSpec } from "./agent";
import { BASKET_CADENCES_SEC, BASKET_LANES, basketLanesText, isBasketMembers } from "./basket";
import type { AgentSpec, BasketLanes, BasketSpec, MirrorSpec, OracleFollowSpec, PresetKey, StrategyMetadata, StrategySpec } from "./types";

/** The presets, in the reference's words (`lib/sui/strategyClient.ts` PRESETS), plus the agent and the basket. */
export const PRESETS: Record<PresetKey | "basket", { name: string; tagline: string; how: string }> = {
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
  basket: {
    name: "Theme",
    tagline: "Trade a stock basket",
    how: "Calls each stock's own Windows with one rule, every call sized by that stock's weight in the basket.",
  },
};

/** A copy that chases a call older than a Window's own life is copying nothing; a few seconds is too jumpy to fill. */
export const MIRROR_WITHIN_MIN_SEC = 30;
export const MIRROR_WITHIN_MAX_SEC = 3_600;

export const LOOKBACK_MIN = 2;
export const LOOKBACK_MAX = 12;

const pctText = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
const andList = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** A theme in words: what it holds, where it trades, how it calls, how each call is sized. */
function describeBasket(s: BasketSpec): string {
  const members = andList(s.members.map((m) => `${m.symbol} ${pctText(m.weightBps)}`));
  const rule = s.rule.preset === "agent" ? describeAgentSpec(s.rule, "each stock's") : `Once a price moves ${pctText(s.rule.thresholdBps)} from its opening print, it bets ${s.rule.preset === "momentum" ? "with" : "against"} the move.`;
  return `Calls ${members} on their ${basketLanesText(s.lanes)} Windows. ${rule} Each call is sized by the stock's weight.`;
}

/** Plain-language description of exactly what the runner will do with this spec (reference `describeSpec`). */
export function describeSpec(s: StrategySpec, asset = "BTC"): string {
  if (s.preset === "basket") return describeBasket(s);
  if (s.preset === "agent") return describeAgentSpec(s, asset);
  if (s.preset === "mirror") return `Every round it reads what ${shortTrader(s.trader)} did on each live Window. If that wallet took a side in the last ${s.withinSec} seconds and is still net on it, this takes the same side. Your order lands after theirs, at the book's price then.`;
  const dir = s.preset === "momentum" ? "with" : "against";
  const pct = (s.thresholdBps / 100).toFixed(2).replace(/\.?0+$/, "");
  // The Window settles against its opening print, so that print is the reference (Masayume's model); the lookback is
  // only for a Window with no print, which a trading Window on Tempo never is.
  return `Every round it compares ${asset}'s price with the Window's opening print. Once it has moved at least ${pct}%, it bets ${dir} that move. Otherwise it sits out.`;
}

function specObject(s: StrategySpec): Record<string, unknown> {
  if (s.preset === "mirror") return { p: "mirror", t: s.trader.toLowerCase(), w: s.withinSec };
  if (s.preset === "agent") return { p: "agent", persona: s.persona, po: s.posture, c: s.cadences };
  if (s.preset === "basket") return { p: "basket", m: s.members.map((m) => [m.symbol, m.weightBps]), l: s.lanes, r: specObject(s.rule) };
  return { p: s.preset, lb: s.lookback, th: s.thresholdBps };
}

/**
 * Compact, deterministic serialization — what `specHash` is taken over (reference `encodeSpec`).
 * The momentum/reversion, agent and mirror branches are byte-identical to their first release, so no published hash
 * moves; a basket nests its rule's own encoding and keeps its members in the creator's order.
 */
export function encodeSpec(s: StrategySpec): string {
  return JSON.stringify(specObject(s));
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

/** A basket's rule: a momentum/reversion rule, or an agent reading only the stock lanes' cadences. */
function isBasketRule(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return isOracleFollowSpec(r) || (isAgentSpec(r) && r.cadences.every((c) => BASKET_CADENCES_SEC.includes(c)));
}

function isBasketSpec(v: Record<string, unknown>): v is BasketSpec & Record<string, unknown> {
  return v.preset === "basket" && BASKET_LANES.includes(v.lanes as BasketLanes) && isBasketRule(v.rule) && isBasketMembers(v.members, v.lanes as BasketLanes);
}

export function isSpec(value: unknown): value is StrategySpec {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return isOracleFollowSpec(v) || isAgentSpec(v) || isMirrorSpec(v) || isBasketSpec(v);
}

/** A theme's spec, narrowed. */
export const isBasket = (spec: StrategySpec | null | undefined): spec is BasketSpec => spec?.preset === "basket";

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
