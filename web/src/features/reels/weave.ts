// Ported from Agari 03b30ab:web/src/features/takes/weave.ts (S13 step 9) — Windows and takes as one stream: market,
// take, market, take… then whichever list has a tail. Starting on a live Window keeps the first card actionable.
// R4-11 (D-227): a third kind, Owarine 90a91d71:web/src/features/takes/weave.ts's desk decision — the copied agent's
// latest notable decision, woven in once at the fifth card (never pinned at the top). A theme rebalance joins it later.
import type { EventMarket } from "@cwf/core";
import type { Take } from "@/features/social/useTakes";
import type { StrategyReelDecision } from "./StrategyReelCard";

export type ReelItem = { kind: "market"; market: EventMarket } | { kind: "take"; take: Take } | { kind: "agent"; agent: StrategyReelDecision };

/** Where the agent's card sits: after the first few cards, so the reel still opens on a live Window. */
export const AGENT_AT = 4;

export function weaveReel(rounds: readonly EventMarket[], takes: readonly Take[], agent: StrategyReelDecision | null = null): ReelItem[] {
  const out: ReelItem[] = [];
  for (let i = 0; i < Math.max(rounds.length, takes.length); i += 1) {
    const market = rounds[i];
    const take = takes[i];
    if (market) out.push({ kind: "market", market });
    if (take) out.push({ kind: "take", take });
  }
  if (!agent || out.length === 0) return out;
  const at = Math.min(AGENT_AT, out.length);
  return [...out.slice(0, at), { kind: "agent", agent }, ...out.slice(at)];
}

export const reelKey = (item: ReelItem): string => (item.kind === "market" ? item.market.marketId : item.kind === "take" ? `take-${item.take.id}` : `agent-${item.agent.strategyId}-${item.agent.decision.decidedAtMs}`);
