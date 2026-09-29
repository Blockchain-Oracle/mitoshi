// Ported from Agari 03b30ab:packages/core/src/market/horizons.test.ts
import { describe, expect, it } from "vitest";
import type { EventMarket, LaneSet } from "../types/market";
import { groupByHorizon, HORIZONS, WORD_BOARD_MIN_LEAD_MS } from "./horizons";

const NOW_MS = 1_800_000_000_000;
const NOW_SEC = NOW_MS / 1000;

/** Only the fields the grouping reads; the rest of EventMarket is irrelevant here. */
function market(id: string, secondsOut: number): EventMarket {
  return { marketId: id, expirySec: NOW_SEC + secondsOut } as unknown as EventMarket;
}

function laneSet(...markets: EventMarket[]): LaneSet {
  return { lanes: [{ basis: "regular", intervalSec: 300, label: "5m", markets, nextStartSec: null }] };
}

const ids = (laneSetIn: LaneSet) => groupByHorizon(laneSetIn, NOW_MS).map((g) => [g.key, g.markets.map((m) => m.marketId)]);

describe("groupByHorizon", () => {
  it("separates the unread board from an empty one", () => {
    // Different states: one is "we have not read yet", the other is a claim about the venue.
    expect(groupByHorizon(null, NOW_MS)).toEqual([]);
    expect(groupByHorizon(laneSet(market("a", 60)), 0)).toEqual([]);
  });

  it("puts each Window in exactly one band, boundaries included", () => {
    const soonEdge = HORIZONS[0].withinMs / 1000;
    const hourEdge = HORIZONS[1].withinMs / 1000;
    expect(
      ids(laneSet(market("on-soon-edge", soonEdge), market("just-past-soon", soonEdge + 1), market("on-hour-edge", hourEdge), market("just-past-hour", hourEdge + 1))),
    ).toEqual([
      ["soon", ["on-soon-edge"]],
      ["hour", ["just-past-soon", "on-hour-edge"]],
      ["later", ["just-past-hour"]],
    ]);
  });

  it("drops Windows too close to expiry to act on, and keeps the one just inside", () => {
    const lead = WORD_BOARD_MIN_LEAD_MS / 1000;
    expect(ids(laneSet(market("expired", -5), market("on-the-lead", lead), market("inside", lead + 1)))).toEqual([["soon", ["inside"]]]);
  });

  it("orders by close across every lane and omits empty bands", () => {
    const twoLanes: LaneSet = {
      lanes: [
        { basis: "regular", intervalSec: 3600, label: "1h", markets: [market("hourly", 120)], nextStartSec: null },
        { basis: "regular", intervalSec: 300, label: "5m", markets: [market("five", 60)], nextStartSec: null },
      ],
    };
    // Only "soon" survives — the other two bands are dropped, not rendered empty.
    expect(ids(twoLanes)).toEqual([["soon", ["five", "hourly"]]]);
  });

  describe("with the stock market closed (S23)", () => {
    /** A Window with the fields `phase` reads: listed before its bell unless it has started. */
    const win = (id: string, lane: EventMarket["lane"], startsIn: number, expiresIn: number, intervalSec = 300): EventMarket =>
      ({ marketId: id, lane, intervalSec, tradingStartSec: NOW_SEC + startsIn, lockAtSec: NOW_SEC + expiresIn, expirySec: NOW_SEC + expiresIn, openingPriceRaw: startsIn > 0 ? null : 1n, state: "open" }) as unknown as EventMarket;

    it("moves a stock Window listed before its bell out of the closing bands, even when its expiry is near", () => {
      // 09:25 ET: the 09:30–09:35 Window expires in ten minutes but cannot be bought yet.
      expect(ids(laneSet(win("stock-at-bell", "regular", 300, 600), win("token-live", "crypto24", -600, 1_800, 3_600)))).toEqual([
        ["hour", ["token-live"]],
        ["listed", ["stock-at-bell"]],
      ]);
    });

    it("keeps only 24/7 lanes in the closing bands overnight, and lists the bell's Windows by open then cadence", () => {
      const overnight = laneSet(
        win("tsla-60m", "regular", 36_000, 39_600, 3_600),
        win("tsla-5m", "regular", 36_000, 36_300, 300),
        win("openai-60m", "crypto24", -900, 2_700, 3_600),
      );
      expect(ids(overnight)).toEqual([
        ["hour", ["openai-60m"]],
        ["listed", ["tsla-5m", "tsla-60m"]],
      ]);
    });

    it("never lists an upcoming token Window: a 24/7 lane is grouped by its close", () => {
      expect(ids(laneSet(win("basket-next", "crypto24", 600, 4_200, 3_600)))).toEqual([["later", ["basket-next"]]]);
    });
  });
});
