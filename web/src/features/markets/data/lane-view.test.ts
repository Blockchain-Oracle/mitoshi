import type { EventMarket, Lane, LaneBasis } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { boardLanes, laneKeyOf, laneTabLabel } from "./lane-view";

const market = (asset: string, lane: LaneBasis, intervalSec: number, expirySec: number) => ({ asset, lane, intervalSec, expirySec, marketId: `${asset}-${lane}-${intervalSec}-${expirySec}` }) as unknown as EventMarket;
const lane = (basis: LaneBasis, intervalSec: number, markets: EventMarket[]): Lane => ({ basis, intervalSec, label: "", markets, nextStartSec: null });

describe("boardLanes (D-226: Markets is every market)", () => {
  const set = {
    lanes: [
      lane("regular", 300, [market("TSLA", "regular", 300, 900)]),
      lane("gap", 604_800, [market("NVDA", "gap", 604_800, 9_000)]),
      lane("stock24", 300, [market("NVDA", "stock24", 300, 600), market("TSLA", "stock24", 300, 600)]),
      lane("crypto24", 300, [market("SOL", "crypto24", 300, 600), market("BTC", "crypto24", 300, 900), market("BTC", "crypto24", 300, 600)]),
      lane("crypto24", 900, [market("ETH", "crypto24", 900, 1_800)]),
    ],
  };
  const board = boardLanes(set);

  it("puts a cadence's coins and 24/7 stocks in one lane, and the 24/7 lanes before the session's", () => {
    expect(board.lanes.map((l) => laneTabLabel(laneKeyOf(l)))).toEqual(["5m · 24/7", "15m · 24/7", "5m", "Gap"]);
  });

  it("lists the coins first, BTC leading, then the stocks, each soonest first", () => {
    expect(board.lanes[0]!.markets.map((m) => `${m.asset}@${m.expirySec}`)).toEqual(["BTC@600", "BTC@900", "SOL@600", "TSLA@600", "NVDA@600"]);
  });

  it("keeps every Window", () => {
    expect(board.lanes.flatMap((l) => l.markets)).toHaveLength(set.lanes.flatMap((l) => l.markets).length);
  });
});
