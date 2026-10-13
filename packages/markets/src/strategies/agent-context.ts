// Moved from services/ops/src/actors/strategy-runner/agent.ts (R4-6, D-227; automate portPlan 7, Owarine 90a91d71
// `readAgentContext`): what an agent reads about one Window — its opening print and the RedStone spot it settles on (up
// to 12 samples across the Window so far and an EMA over them), both books quoted at the stake — assembled one way for
// the runner and for the studio's test read. The spot comes from the caller (the runner's in-memory feed, the web's
// stored ticks); nothing here is invented: no fresh spot, no context.
import type { AgentContext, AgentSample } from "@cwf/core";
import { quoteFromBook, type YesBook } from "../engine/quote";
import type { RunnerWindow } from "../ops/strategy-runner";

export const AGENT_MAX_SAMPLES = 12;
export const AGENT_FEED_DECIMALS = 8;
export const AGENT_COLLATERAL_DECIMALS = 6;

/** Up to 12 spot points across the Window so far (oldest first), and an EMA over them. */
export function samplesOf(at: (sec: number, windowSec: number) => { priceE8: bigint } | null, fromSec: number, nowSec: number): { samples: AgentSample[]; emaE8: bigint | null } {
  const span = Math.max(1, nowSec - fromSec);
  const step = Math.max(10, Math.ceil(span / AGENT_MAX_SAMPLES));
  const samples: AgentSample[] = [];
  for (let t = fromSec + step; t <= nowSec && samples.length < AGENT_MAX_SAMPLES; t += step) {
    const q = at(t, step);
    if (q) samples.push({ atSec: t, priceRaw: q.priceE8 });
  }
  if (samples.length === 0) return { samples, emaE8: null };
  // α = 2 / (n + 1), in integer arithmetic on the feed's own scale.
  const n = BigInt(samples.length);
  let ema = samples[0]!.priceRaw;
  for (const s of samples.slice(1)) ema = (s.priceRaw * 2n + ema * (n - 1n)) / (n + 1n);
  return { samples, emaE8: ema };
}

/** One symbol's spot: the latest fresh quote, and the newest at or before a moment within a window. */
export interface AgentSpot {
  latest(): { priceE8: bigint } | null;
  at(sec: number, windowSec: number): { priceE8: bigint } | null;
}

/** The context the prompt sees for this Window, or null when the spot is missing or stale (the read then holds). */
export function agentContextOf(input: { window: RunnerWindow; spot: AgentSpot | null; book: YesBook | null; stakeBase: bigint; nowMs: number }): AgentContext | null {
  const { window: w, spot, book, stakeBase, nowMs } = input;
  const nowSec = Math.floor(nowMs / 1000);
  const latest = spot?.latest() ?? null;
  const { samples, emaE8 } = spot ? samplesOf((sec, win) => spot.at(sec, win), w.tradingStartSec, nowSec) : { samples: [], emaE8: null };
  if (!w.spotSymbol || !latest || emaE8 === null) return null;
  const centsOf = (side: "up" | "down") => (book ? (quoteFromBook(book, w.grid, side, stakeBase, nowMs)?.oddsCents ?? null) : null);
  return {
    asset: w.spotSymbol.replace(/-24$/, ""), intervalSec: w.cadenceSec, tradingStartSec: w.tradingStartSec, openingRaw: w.openPriceE8, emaRaw: emaE8, spotRaw: latest.priceE8, feedDecimals: AGENT_FEED_DECIMALS,
    samples, upCents: centsOf("up"), downCents: centsOf("down"), stakeBase, collateralDecimals: AGENT_COLLATERAL_DECIMALS,
    elapsedSec: Math.max(0, nowSec - w.tradingStartSec), leftSec: Math.max(0, w.lockAtSec - nowSec),
  };
}
