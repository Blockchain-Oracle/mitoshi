"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/hero/HeroCadenceTabs.tsx (R4-3, D-227) — how long the bet runs,
// beside the headline it governs. Slots derive from the live lanes that list this asset (FR-6: never a hardcoded list),
// on the hero's own side of the clock (`isAllHoursLane`: the board merges 24/7 stock Windows into the 24/7 lanes, so a
// 24/7 stock hero gets the 24/7 cadences, not the Regular ones); a tap selects this asset's Window in that lane. The
// pinned lane keeps its slot, dimmed and titled "Between rounds", while this asset has no Window in it.
import { isAllHoursLane, type EventMarket, type Lane, type MarketId } from "@cwf/core";
import { HERO_HEAD } from "../copy";
import { laneKeyOf, laneTabLabel, type LaneTabKey } from "../data/lane-view";

interface HeroCadenceTabsProps {
  market: EventMarket;
  lanes: readonly Lane[];
  activeKey: LaneTabKey | null;
  onPick: (key: LaneTabKey, marketId: MarketId) => void;
}

export function HeroCadenceTabs({ market, lanes, activeKey, onPick }: HeroCadenceTabsProps) {
  const allHours = isAllHoursLane(market.lane);
  const slots = lanes
    .filter((lane) => isAllHoursLane(lane.basis) === allHours)
    .map((lane) => ({ key: laneKeyOf(lane), target: lane.markets.find((m) => m.asset === market.asset) ?? null }))
    .filter((slot) => slot.target !== null || slot.key === activeKey);
  if (slots.length === 0) return null;
  return (
    <div className="mh-cadence-tabs" role="group" aria-label={HERO_HEAD.cadenceGroup}>
      {slots.map((slot) => {
        const on = slot.target ? slot.target.marketId === market.marketId : slot.key === activeKey;
        return (
          <button
            key={slot.key}
            type="button"
            className="mh-cadence"
            aria-pressed={on}
            disabled={slot.target === null}
            title={slot.target === null ? HERO_HEAD.betweenRounds : undefined}
            onClick={() => slot.target && onPick(slot.key, slot.target.marketId)}
          >
            {laneTabLabel(slot.key)}
            {on && <span aria-hidden className="mh-cadence-underline" />}
          </button>
        );
      })}
    </div>
  );
}
