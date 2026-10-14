import { diagnosis, type EventMarket } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { pickAlt } from "./alt-window";
import { fitAmountBase, rangeBlocker, type RangeBlockInput } from "./blockers";

let n = 0;
const market = (asset: string, lane: EventMarket["lane"], intervalSec: number, expirySec: number): EventMarket =>
  ({ marketId: `0x${(++n).toString(16).padStart(64, "0")}`, asset, lane, intervalSec, expirySec }) as unknown as EventMarket;

const btc5 = market("BTC", "crypto24", 300, 1_000);
const btc15 = market("BTC", "crypto24", 900, 1_600);
const eth5 = market("ETH", "crypto24", 300, 1_000);
const aapl = market("AAPL", "regular", 900, 1_600);
const aapl24 = market("AAPL", "stock24", 900, 1_600);
const tsla = market("TSLA", "regular", 900, 1_600);
const list = [btc5, eth5, aapl, aapl24, btc15, tsla].map((m) => ({ market: m, priced: true }));

const base = (over: Partial<RangeBlockInput> = {}): RangeBlockInput => ({
  game: "range",
  market: btc5,
  paused: false,
  hasModel: true,
  spot: "ready",
  amountZero: false,
  overRungCap: null,
  drifted: false,
  refusal: null,
  quote: "ready",
  capacity: null,
  band: { side: "inside", preset: "medium" },
  rung: null,
  fitText: null,
  funding: "ready",
  overBalance: null,
  alts: list,
  ...over,
});

const refused = (errorName: string) => ({ ...diagnosis("contract-revert", errorName), errorName });

describe("pickAlt", () => {
  it("takes a stock's twin lane first, else another asset on the same cadence", () => {
    expect(pickAlt("twin-or-cadence", aapl, list)?.marketId).toBe(aapl24.marketId);
    expect(pickAlt("twin-or-cadence", btc5, list)?.marketId).toBe(eth5.marketId);
  });
  it("moves a locking Window to the same asset's next-longer cadence", () => {
    expect(pickAlt("longer", btc5, list)?.marketId).toBe(btc15.marketId);
    expect(pickAlt("longer", btc15, list)?.asset).not.toBe("BTC");
  });
  it("never offers an unpriced Window or the current one", () => {
    const only = [{ market: btc5, priced: true }, { market: eth5, priced: false }];
    expect(pickAlt("other-asset", btc5, only)).toBeNull();
  });
  it("offers a fresh-priced Window only when one is fresh", () => {
    expect(pickAlt("fresh", btc5, list, () => false)).toBeNull();
    expect(pickAlt("fresh", btc5, list, (m) => m.asset === "TSLA")?.asset).toBe("TSLA");
  });
});

describe("rangeBlocker", () => {
  it("is null when the order can be placed", () => {
    expect(rangeBlocker(base())).toBeNull();
  });
  it("turns a paused reserve into the asset's Up/Down", () => {
    const b = rangeBlocker(base({ paused: true }));
    expect(b?.label).toBe("Trade BTC Up/Down →");
    expect(b?.fix).toEqual({ kind: "href", href: "/trade/BTC" });
  });
  it("names the price wait, then offers Retry and only a fresh Window when late", () => {
    expect(rangeBlocker(base({ spot: "waiting" }))).toMatchObject({ wait: true, label: "Waiting for the price" });
    const late = rangeBlocker(base({ spot: "late", isFresh: (m) => m.asset === "ETH" }));
    expect(late).toMatchObject({ label: "Retry", caption: "Price feed is late", fix: { kind: "retry-spot" } });
    expect(late?.alt?.label).toBe("Try ETH 5m →");
    expect(rangeBlocker(base({ spot: "late", isFresh: () => false }))?.alt).toBeNull();
  });
  it("offers $5 for an empty amount", () => {
    expect(rangeBlocker(base({ amountZero: true }))).toMatchObject({ label: "Use $5", fix: { kind: "amount", text: "5" } });
  });
  it("sends a thin book to a real Window, else states it", () => {
    expect(rangeBlocker(base({ refusal: refused("ThinBook") }))).toMatchObject({ label: "Try ETH 5m →", caption: "BTC's book is too thin" });
    expect(rangeBlocker(base({ refusal: refused("ThinBook"), alts: null }))).toMatchObject({ label: "Book too thin", fix: null });
  });
  it("widens an inside long shot and narrows an outside one", () => {
    expect(rangeBlocker(base({ refusal: refused("LongShot") }))?.fix).toEqual({ kind: "preset", preset: "wide" });
    expect(rangeBlocker(base({ refusal: refused("LongShot"), band: { side: "outside", preset: "medium" } }))?.fix).toEqual({ kind: "preset", preset: "tight" });
    expect(rangeBlocker(base({ refusal: refused("LongShot"), band: { side: "inside", preset: "wide" } }))?.fix).toBeNull();
  });
  it("moves Moonshot down a rung for a long shot", () => {
    expect(rangeBlocker(base({ game: "moonshot", band: null, rung: { lower: 5, higher: 25 }, refusal: refused("LongShot") }))).toMatchObject({ label: "Try ×5", fix: { kind: "rung", multiple: 5 } });
  });
  it("fits the stake to the reserve's cap, $1 when the room is unknown", () => {
    expect(rangeBlocker(base({ capacity: refused("OverExposure"), fitText: "$12" }))).toMatchObject({ label: "Use $12", fix: { kind: "amount", text: "12" } });
    expect(rangeBlocker(base({ capacity: refused("OverExposure") }))?.label).toBe("Use $1");
  });
  it("names the quote wait, then Retry when late", () => {
    expect(rangeBlocker(base({ quote: "waiting" }))).toMatchObject({ wait: true, label: "Pricing" });
    expect(rangeBlocker(base({ quote: "late" }))).toMatchObject({ label: "Retry", caption: "Quote is late" });
  });
  it("asks for money last, with what's free and what's needed", () => {
    expect(rangeBlocker(base({ overBalance: { freeText: "$2", stakeText: "$5" } }))).toMatchObject({ label: "Add money", caption: "$2 free · needs $5", fix: { kind: "add-money" } });
  });
  it("keeps every label within six words", () => {
    const words = (s: string) => s.split(/\s+/).filter((w) => w !== "→" && w !== "·").length;
    for (const errorName of ["ThinBook", "WideBook", "StaleBasis", "TooLate", "TooFar", "LongShot", "NearCertain", "OverExpiryCap", "OverPayoutCap", "Weird"]) {
      const b = rangeBlocker(base({ refusal: refused(errorName), alts: null }));
      expect(words(b!.label)).toBeLessThanOrEqual(6);
    }
  });
});

describe("fitAmountBase", () => {
  const reserve = { liquidBase: 1_000_000_000n, lockedBase: 0n, totalValueBase: 1_000_000_000n, params: { maxExposureBps: 5_000, maxExpiryLockedBase: 100_000_000n, maxPayoutCapBase: 500_000_000n } };
  it("takes the tightest room over what the house fronts per $1", () => {
    // ×4: the house fronts $3 per $1 staked; the expiry has $60 of room → $20.
    expect(fitAmountBase({ stakeBase: 5_000_000n, maxPayoutBase: 20_000_000n, reserve, lockedByExpiryBase: 40_000_000n, mode: "fixStake", decimals: 6 })).toBe(20_000_000n);
    // The same, as a payout: $80.
    expect(fitAmountBase({ stakeBase: 5_000_000n, maxPayoutBase: 20_000_000n, reserve, lockedByExpiryBase: 40_000_000n, mode: "fixPayout", decimals: 6 })).toBe(80_000_000n);
  });
  it("never goes under $1 and is null when the expiry wasn't read", () => {
    expect(fitAmountBase({ stakeBase: 5_000_000n, maxPayoutBase: 20_000_000n, reserve, lockedByExpiryBase: 100_000_000n, mode: "fixStake", decimals: 6 })).toBe(1_000_000n);
    expect(fitAmountBase({ stakeBase: 5_000_000n, maxPayoutBase: 20_000_000n, reserve, lockedByExpiryBase: null, mode: "fixStake", decimals: 6 })).toBeNull();
  });
});
