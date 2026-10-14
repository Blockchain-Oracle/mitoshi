/**
 * The real Window a Range or Moonshot blocker offers instead (R6 games §4.3.5, T06): "Try BTC 15m →" always names a
 * Window the reserve can price right now, picked from the page's own list (soonest close first, as `useRangeWindows`
 * returns it) by the rule the blocker calls for — never one that would refuse for the same reason.
 */
import type { EventMarket } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";

export interface AltCandidate {
  market: EventMarket;
  /** Priced by the reserve (a model exists); only these are offered. */
  priced: boolean;
}

export type AltRule =
  /** Any other asset's soonest priced Window (no model for this asset). */
  | "other-asset"
  /** The same asset's other lane (NYSE ↔ 24/7), else another asset on this cadence (the book lags, is thin or wide). */
  | "twin-or-cadence"
  /** The same asset and lane on the next-longer cadence, else another asset (this one locks soon). */
  | "longer"
  /** The same asset's Window closing before this one, the latest such (this one is too far out). */
  | "sooner"
  /** Another expiry — the same asset's next, else anyone's (this expiry is full). */
  | "next-expiry"
  /** The soonest Window whose own price is fresh (this asset's feed is late). */
  | "fresh";

const sameLane = (a: EventMarket, b: EventMarket) => a.asset === b.asset && a.lane === b.lane;
/** A stock's NYSE session and its 24/7 one are twins; a coin's one lane and the weekend Gap have none. */
const twinLane = (m: EventMarket) => (m.lane === "regular" ? "stock24" : m.lane === "stock24" ? "regular" : null);

export function pickAlt(rule: AltRule, current: EventMarket, candidates: readonly AltCandidate[], isFresh?: (m: EventMarket) => boolean): EventMarket | null {
  const pool = candidates.filter((c) => c.priced && c.market.marketId !== current.marketId).map((c) => c.market);
  const otherAsset = () => pool.find((m) => m.asset !== current.asset) ?? null;
  switch (rule) {
    case "other-asset":
      return otherAsset();
    case "twin-or-cadence":
      return pool.find((m) => m.asset === current.asset && m.lane === twinLane(current)) ?? pool.find((m) => m.asset !== current.asset && m.intervalSec === current.intervalSec) ?? null;
    case "longer": {
      const longer = pool.filter((m) => sameLane(m, current) && m.intervalSec > current.intervalSec).sort((a, b) => a.intervalSec - b.intervalSec)[0];
      return longer ?? otherAsset();
    }
    case "sooner":
      return pool.filter((m) => m.asset === current.asset && m.expirySec < current.expirySec).sort((a, b) => b.expirySec - a.expirySec)[0] ?? null;
    case "next-expiry":
      return pool.find((m) => m.asset === current.asset && m.expirySec !== current.expirySec) ?? pool.find((m) => m.expirySec !== current.expirySec) ?? null;
    case "fresh":
      return isFresh ? (pool.find((m) => isFresh(m)) ?? null) : null;
  }
}

/** "BTC 15m", "AAPL Gap" — the Window as its chip names it. */
export function windowText(m: EventMarket, gapWord: string): string {
  return `${m.asset} ${m.lane === "gap" ? gapWord : formatCadence(m.intervalSec)}`;
}
