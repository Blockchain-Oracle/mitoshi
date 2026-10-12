/**
 * How a lane reads (Ported from Agari 03b30ab:web/src/features/markets/lanes/lane-view.ts, the tab key and label half):
 * one lane per (basis, cadence) as core `groupIntoLanes` keys it, so a 5m session lane and a 5m 24/7 lane stay apart —
 * they price different feeds; on the Markets board the 24/7 coin and stock lanes of a cadence share one tab
 * (`boardLanes`, D-226). Pure.
 */
import { CRYPTO_SYMBOLS, formatCadence, isAllHoursLane, laneLabel, LANE_BASES, STOCK_SYMBOLS, type EventMarket, type Lane, type LaneBasis, type LaneSet } from "@cwf/core";

export type LaneTabKey = `${LaneBasis}:${number}`;

export const laneTabKey = (basis: LaneBasis, intervalSec: number): LaneTabKey => `${basis}:${intervalSec}`;
export const laneKeyOf = (lane: Pick<Lane, "basis" | "intervalSec">): LaneTabKey => laneTabKey(lane.basis, lane.intervalSec);

const KEY_RE = new RegExp(`^(${LANE_BASES.join("|")}):(\\d+)$`);

export function parseLaneTabKey(raw: string): LaneTabKey | null {
  const match = KEY_RE.exec(raw);
  return match ? laneTabKey(match[1] as LaneBasis, Number(match[2])) : null;
}

export function laneTabParts(key: LaneTabKey): { basis: LaneBasis; intervalSec: number } {
  const [basis, interval] = key.split(":") as [LaneBasis, string];
  return { basis, intervalSec: Number(interval) };
}

export function laneTabLabel(key: LaneTabKey): string {
  const { basis, intervalSec } = laneTabParts(key);
  return isAllHoursLane(basis) ? `${formatCadence(intervalSec)} · 24/7` : laneLabel(basis, intervalSec);
}

/** Board order inside a 24/7 lane: the coins first (BTC, ETH, SOL), then the stocks in the registry's order. */
const ASSET_RANK = new Map<string, number>([...CRYPTO_SYMBOLS, ...STOCK_SYMBOLS].map((s, i) => [s, i]));
const assetRank = (asset: string) => ASSET_RANK.get(asset) ?? ASSET_RANK.size;

/**
 * The Markets board's lanes (D-226, Owarine's lanes): every 24/7 Window of one cadence in one lane — the coins and the
 * 24/7 stock feeds side by side, coins first — keyed as the crypto lane of that cadence; the 24/7 lanes lead the tabs, then
 * the session's Regular lanes, then the Gap. Core's `groupIntoLanes` keeps crypto24 and stock24 apart (they price
 * different feeds, and the terminal picks Windows per lane); only the board merges them.
 */
export function boardLanes(set: LaneSet): LaneSet {
  const allHours = new Map<number, Lane>();
  const session: Lane[] = [];
  for (const lane of set.lanes) {
    if (!isAllHoursLane(lane.basis)) {
      session.push(lane);
      continue;
    }
    const held = allHours.get(lane.intervalSec);
    const nextStartSec = [held?.nextStartSec, lane.nextStartSec].filter((v): v is number => v !== null && v !== undefined).sort((a, b) => a - b)[0] ?? null;
    allHours.set(lane.intervalSec, {
      basis: "crypto24",
      intervalSec: lane.intervalSec,
      label: `${formatCadence(lane.intervalSec)} · 24/7`,
      markets: [...(held?.markets ?? []), ...lane.markets],
      nextStartSec,
    });
  }
  const merged = [...allHours.values()]
    .sort((a, b) => a.intervalSec - b.intervalSec)
    .map((lane) => ({ ...lane, markets: [...lane.markets].sort((a, b) => assetRank(a.asset) - assetRank(b.asset) || a.expirySec - b.expirySec) }));
  return { lanes: [...merged, ...session] };
}

/** The tickers a lane lists, in board order (first expiry first). */
export function laneTickers(lane: Lane): string[] {
  return [...new Set(lane.markets.map((m) => m.asset))];
}

export function tickerMarkets(lane: Lane, ticker: string | null): EventMarket[] {
  return ticker === null ? lane.markets : lane.markets.filter((m) => m.asset === ticker);
}
