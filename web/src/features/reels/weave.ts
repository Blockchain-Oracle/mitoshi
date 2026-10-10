// Ported from Agari 03b30ab:web/src/features/takes/weave.ts (S13 step 9) — Windows and takes as one stream: market,
// take, market, take… then whichever list has a tail. Starting on a live Window keeps the first card actionable.
// Agari's holding and desk cards have no Mitoshi counterpart (stock holdings arrive with S15e).
import type { EventMarket } from "@cwf/core";
import type { Take } from "@/features/social/useTakes";

export type ReelItem = { kind: "market"; market: EventMarket } | { kind: "take"; take: Take };

export function weaveReel(rounds: readonly EventMarket[], takes: readonly Take[]): ReelItem[] {
  const out: ReelItem[] = [];
  for (let i = 0; i < Math.max(rounds.length, takes.length); i += 1) {
    const market = rounds[i];
    const take = takes[i];
    if (market) out.push({ kind: "market", market });
    if (take) out.push({ kind: "take", take });
  }
  return out;
}

export const reelKey = (item: ReelItem): string => (item.kind === "market" ? item.market.marketId : `take-${item.take.id}`);
