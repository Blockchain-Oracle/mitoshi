"use client";
// The session a stock's band sits on (R6 games §4.3.2; From 21st.dev 23552 ddoemonn/segmented-control, reused — the
// Price/Depth control's look): one chip per asset now, so when the picked stock has both its NYSE Window and its 24/7
// Window live in this cadence, NYSE | 24/7 picks between them, over the ticket. With the NYSE shut only the 24/7 lane
// exists: no switch, one quiet line saying which book it is.
import type { EventMarket, MarketId } from "@cwf/core";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { RANGE } from "./copy";

const S = RANGE.windows.session;
type Lane = "regular" | "stock24";

export function LaneSwitch({ picked, twin, onPick }: { picked: EventMarket; twin: EventMarket | null; onPick: (id: MarketId) => void }) {
  if (!twin) return picked.lane === "stock24" ? <p className="gw-session">{S.only24}</p> : null;
  const value: Lane = picked.lane === "stock24" ? "stock24" : "regular";
  return (
    <SegmentedControl<Lane>
      label={S.label}
      value={value}
      options={[{ value: "regular", label: S.regular }, { value: "stock24", label: S.stock24 }]}
      onValueChange={(v) => onPick(v === value ? picked.marketId : twin.marketId)}
      className="gw-lane"
    />
  );
}
