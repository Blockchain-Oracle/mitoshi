"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/hero/HeroCadenceTabs.tsx — how long the bet runs, beside the
// headline it governs. Slots derive from the live lanes that list this asset (FR-6: never a hardcoded list); a tap
// selects this asset's Window in that lane.
import type { EventMarket, Lane, MarketId } from "@cwf/core";
import { HERO_HEAD } from "../copy";
import { laneKeyOf, laneTabLabel, type LaneTabKey } from "../data/lane-view";

export function HeroCadenceTabs({ market, lanes, onPick }: { market: EventMarket; lanes: readonly Lane[]; onPick: (key: LaneTabKey, marketId: MarketId) => void }) {
  const slots = lanes
    .map((lane) => ({ key: laneKeyOf(lane), target: lane.markets.find((m) => m.asset === market.asset) ?? null, basis: lane.basis }))
    .filter((s) => s.target !== null && (s.basis === "crypto24") === (market.lane === "crypto24"));
  if (slots.length <= 1) return null;
  return (
    <div className="mh-cadence-tabs" role="group" aria-label={HERO_HEAD.cadenceGroup}>
      {slots.map((slot) => {
        const on = slot.target!.marketId === market.marketId;
        return (
          <button key={slot.key} type="button" className="mh-cadence" aria-pressed={on} onClick={() => onPick(slot.key, slot.target!.marketId)}>
            {laneTabLabel(slot.key)}
            {on && <span aria-hidden className="mh-cadence-underline" />}
          </button>
        );
      })}
    </div>
  );
}
