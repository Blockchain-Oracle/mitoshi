// Ported in role from Agari 03b30ab:web/src/features/strategies/{studio-draft,StudioForm}.ts — the builder's draft and
// every reason a step can't advance, checked in one pure place; on Tempo the result is one `strategy-publish` (plus,
// first, an optional sponsored ERC-8004 `register`, D-218.7).
import {
  AGENT_PERSONA_MAX_CHARS, isSpec, LOOKBACK_MAX, LOOKBACK_MIN, MIRROR_WITHIN_MAX_SEC, MIRROR_WITHIN_MIN_SEC, parseDecimalToBaseUnits, USD_DECIMALS,
  type AgentPosture, type PresetKey, type StrategyEnvelope, type StrategyMetadata, type StrategySpec,
} from "@cwf/core";
import { isAddress } from "viem";
import type { SeriesWire } from "./protocol";

export interface Draft {
  preset: PresetKey;
  lookback: number;
  thresholdBps: number;
  persona: string;
  posture: AgentPosture;
  cadences: number[];
  trader: string;
  withinSec: number;
  /** A series id, or "" for any Window. */
  seriesId: string;
  perTradeText: string;
  dailyText: string;
  openText: string;
  /** The dearest side it may buy, in cents; "" for no cap. */
  priceCentsText: string;
  feeText: string;
  name: string;
  description: string;
  identity: boolean;
  runner: "house" | "own";
  ownRunner: string;
}

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;
const MAX_FEE_BASE = 100_000_000n;

export const EMPTY_DRAFT: Draft = {
  preset: "momentum", lookback: 6, thresholdBps: 20, persona: "", posture: "guarded", cadences: [300], trader: "", withinSec: 120, seriesId: "",
  perTradeText: "5", dailyText: "50", openText: "3", priceCentsText: "90", feeText: "0", name: "", description: "", identity: true, runner: "house", ownRunner: "",
};

export interface DraftCheck {
  /** The first problem per step (instinct, tune, limits, publish); null when the step is complete. */
  steps: [string | null, string | null, string | null, string | null];
  spec: StrategySpec | null;
  envelope: StrategyEnvelope | null;
  feeBase: bigint;
  runner: `0x${string}` | null;
  metadata: StrategyMetadata | null;
}

const usd = (text: string) => parseDecimalToBaseUnits(text, USD_DECIMALS);

export function specOf(d: Draft): StrategySpec {
  if (d.preset === "agent") return { preset: "agent", persona: d.persona.trim(), posture: d.posture, cadences: [...d.cadences].sort((a, b) => a - b) };
  if (d.preset === "mirror") return { preset: "mirror", trader: d.trader.trim() as `0x${string}`, withinSec: d.withinSec };
  return { preset: d.preset, lookback: d.lookback, thresholdBps: d.thresholdBps };
}

export function checkDraft(d: Draft, ctx: { houseRunner: string | null; series: readonly SeriesWire[] }): DraftCheck {
  const spec = specOf(d);
  const series = ctx.series.find((s) => s.seriesId === d.seriesId) ?? null;
  let tune: string | null = null;
  if (d.preset === "agent") {
    if (d.persona.trim().length === 0) tune = "Write its brief: how it should read a Window.";
    else if (d.persona.length > AGENT_PERSONA_MAX_CHARS) tune = `Keep the brief under ${AGENT_PERSONA_MAX_CHARS} characters.`;
    else if (d.cadences.length === 0) tune = "Pick at least one Window length it reads.";
    else if (series && !d.cadences.includes(series.cadenceSec)) tune = `${series.label} Windows aren't among the lengths it reads.`;
  } else if (d.preset === "mirror") {
    if (!isAddress(d.trader.trim())) tune = "Paste the wallet to copy, exactly as its profile shows it.";
    else if (d.withinSec < MIRROR_WITHIN_MIN_SEC || d.withinSec > MIRROR_WITHIN_MAX_SEC) tune = `Freshness must be ${MIRROR_WITHIN_MIN_SEC}s to ${MIRROR_WITHIN_MAX_SEC / 60} minutes.`;
  } else if (d.lookback < LOOKBACK_MIN || d.lookback > LOOKBACK_MAX) tune = `Lookback is ${LOOKBACK_MIN} to ${LOOKBACK_MAX} prices.`;
  else if (d.thresholdBps < 1 || d.thresholdBps > 1_000) tune = "The threshold is 0.01% to 10%.";
  if (!tune && d.seriesId !== "" && !series) tune = "Pick a market from the list, or any Window.";
  if (!tune && !isSpec(spec)) tune = "This setup isn't one the runner can read.";

  const perTrade = usd(d.perTradeText);
  const daily = usd(d.dailyText);
  const open = /^\d+$/.test(d.openText.trim()) ? Number(d.openText.trim()) : NaN;
  const cents = d.priceCentsText.trim() === "" ? 0 : /^\d+$/.test(d.priceCentsText.trim()) ? Number(d.priceCentsText.trim()) : NaN;
  const fee = usd(d.feeText.trim() === "" ? "0" : d.feeText);
  let limits: string | null = null;
  if (perTrade === null || perTrade <= 0n) limits = "Set the most it may stake a trade.";
  else if (daily === null || daily <= 0n) limits = "Set the most it may spend a day.";
  else if (perTrade > daily) limits = "A trade can't be more than a day's spend.";
  else if (!Number.isInteger(open) || open < 1 || open > 10) limits = "Open Windows at once is 1 to 10.";
  else if (!Number.isInteger(cents) || cents < 0 || cents > 99) limits = "The price cap is 1¢ to 99¢, or blank for none.";
  else if (fee === null || fee > MAX_FEE_BASE) limits = "The fee is $0 to $100.";

  const runner = d.runner === "house" ? (ctx.houseRunner as `0x${string}` | null) : isAddress(d.ownRunner.trim()) ? (d.ownRunner.trim() as `0x${string}`) : null;
  let publish: string | null = null;
  if (d.name.trim().length === 0) publish = "Give it a name.";
  else if (d.name.length > NAME_MAX) publish = `Keep the name under ${NAME_MAX} characters.`;
  else if (d.description.length > DESCRIPTION_MAX) publish = `Keep the description under ${DESCRIPTION_MAX} characters.`;
  else if (!runner) publish = d.runner === "house" ? "The house runner isn't configured on this deployment; name your own." : "Paste your runner's address.";

  const envelope: StrategyEnvelope | null = limits || perTrade === null || daily === null
    ? null
    : { maxStakePerTradeBase: perTrade, maxDailySpendBase: daily, maxOpenPositions: open, maxPriceRaw: BigInt(cents) * 10_000n, series: (series?.seriesId ?? null) as StrategyEnvelope["series"] };
  const metadata: StrategyMetadata | null = tune ? null : { name: d.name.trim(), description: d.description.trim(), spec };
  return { steps: [null, tune, limits, publish], spec: tune ? null : spec, envelope, feeBase: fee ?? 0n, runner, metadata };
}

/**
 * The agent's registration file (ERC-8004 registration-v1, the shape `@cwf/markets` `buildAgentRegistration` serves for
 * house agents), self-contained as a `data:` URI: its id isn't known until the mint, so `registrations` is empty.
 */
export function agentUriOf(d: Draft, origin: string): string {
  const base = origin.replace(/\/$/, "");
  const file = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: d.name.trim(),
    description: d.description.trim() || d.name.trim(),
    image: `${base}/icon-512.png`,
    services: [{ name: "web", endpoint: `${base}/agents` }],
    x402Support: false,
    active: true,
    registrations: [],
    supportedTrust: ["reputation"],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(file));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:application/json;base64,${btoa(binary)}`;
}
