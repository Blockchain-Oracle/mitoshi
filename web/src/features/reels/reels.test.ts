import type { EventMarket, LaneSet } from "@cwf/core";
import { describe, expect, it } from "vitest";
import type { Take } from "@/features/social/useTakes";
import { REEL_CAP, soonestPerAssetAndLane } from "./rounds";
import { weaveReel } from "./weave";

const NOW = 1_800_000_000;
const m = (asset: string, expirySec: number, lane: EventMarket["lane"] = "crypto24") =>
  ({ marketId: `0x${asset}${expirySec}`, asset, lane, intervalSec: 300, tradingStartSec: NOW - 60, lockAtSec: expirySec, expirySec, openingPriceRaw: 1n, decimals: 6 }) as unknown as EventMarket;
const lanes = (groups: EventMarket[][]): LaneSet => ({ lanes: groups.map((markets) => ({ markets })) }) as unknown as LaneSet;

describe("the reel's Windows", () => {
  it("takes the soonest live Window per asset and lane, soonest close first", () => {
    const set = lanes([[m("BTC", NOW + 600), m("BTC", NOW + 300), m("ETH", NOW + 450)], [m("TSLA", NOW + 200, "regular"), m("BTC", NOW - 10)]]);
    expect(soonestPerAssetAndLane(set, NOW * 1000).map((x) => `${x.asset}@${x.expirySec - NOW}`)).toEqual(["TSLA@200", "BTC@300", "ETH@450"]);
  });

  it("never grows past the cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => m(`A${i}`, NOW + 100 + i));
    expect(soonestPerAssetAndLane(lanes([many]), NOW * 1000)).toHaveLength(REEL_CAP);
  });
});

describe("the weave", () => {
  const label = (i: ReturnType<typeof weaveReel>[number]) => (i.kind === "market" ? i.market.asset : i.kind === "take" ? `take ${i.take.id}` : "agent");
  it("starts on a Window and alternates, then the longer list's tail", () => {
    const t = (id: string) => ({ id }) as Take;
    const kinds = weaveReel([m("BTC", NOW + 300), m("ETH", NOW + 400)], [t("1"), t("2"), t("3")]).map(label);
    expect(kinds).toEqual(["BTC", "take 1", "ETH", "take 2", "take 3"]);
  });

  it("weaves the copied agent's decision in once at the fifth card, or at the end of a shorter reel (R4-11)", () => {
    const t = (id: string) => ({ id }) as Take;
    const agent = { strategyId: "7", name: "A", decision: { decidedAtMs: 1 } } as never;
    const long = weaveReel([m("BTC", NOW + 300), m("ETH", NOW + 400), m("SOL", NOW + 500)], [t("1"), t("2"), t("3")], agent).map(label);
    expect(long).toEqual(["BTC", "take 1", "ETH", "take 2", "agent", "SOL", "take 3"]);
    expect(weaveReel([m("BTC", NOW + 300)], [], agent).map(label)).toEqual(["BTC", "agent"]);
    expect(weaveReel([], [], agent)).toEqual([]);
  });
});
