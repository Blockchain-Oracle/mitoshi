import { describe, expect, it } from "vitest";
import { HERO_SPARE_SEC, paysOf, paysText, pickHeroWindow, quoted, sideHref, type HeroCandidate } from "./hero-window";
import { lineGeometry, smooth, thin } from "./sparkline";

const NOW = 10_000;
const w = (symbol: string, cadenceSec: number, expirySec: number, over: Partial<HeroCandidate> = {}): HeroCandidate => ({
  symbol,
  marketId: `${symbol}-${cadenceSec}-${expirySec}`,
  cadenceSec,
  tradingStartSec: NOW - 60,
  expirySec,
  cutoffSec: expirySec - 30,
  openPriceE8: "8349800000000",
  ...over,
});
const all = () => true;

describe("pickHeroWindow", () => {
  it("takes BTC first, its shortest cadence, then its soonest close", () => {
    const pick = pickHeroWindow([w("ETH", 300, NOW + 200), w("BTC", 900, NOW + 400), w("BTC", 300, NOW + 280), w("BTC", 300, NOW + 600)], NOW, all);
    expect(pick?.marketId).toBe(`BTC-300-${NOW + 280}`);
  });
  it("falls to ETH when no BTC Window is quoted", () => {
    const pick = pickHeroWindow([w("BTC", 300, NOW + 280), w("ETH", 300, NOW + 280)], NOW, (id) => !id.startsWith("BTC"));
    expect(pick?.symbol).toBe("ETH");
  });
  it("skips a Window inside its cutoff's spare, one not trading yet, and one with no opening print", () => {
    const late = w("BTC", 300, NOW + 40, { cutoffSec: NOW + HERO_SPARE_SEC - 1 });
    const early = w("BTC", 300, NOW + 600, { tradingStartSec: NOW + 10 });
    const noPrint = w("BTC", 300, NOW + 300, { openPriceE8: "" });
    expect(pickHeroWindow([late, early, noPrint], NOW, all)).toBeNull();
  });
});

describe("pays", () => {
  it("reads UP from the ask and DOWN from 1000 − the bid", () => {
    const pays = paysOf({ bids: [[480, 10n]], asks: [[520, 10n]] });
    expect(pays).toEqual({ upTicks: 520, downTicks: 520 });
    expect(quoted(pays)).toBe(true);
    expect(paysText(520)).toBe("1.92×");
    expect(paysText(80)).toBe("13×");
  });
  it("is unquoted with an empty side or no book", () => {
    expect(quoted(paysOf({ bids: [], asks: [[520, 1n]] }))).toBe(false);
    expect(quoted(paysOf(null))).toBe(false);
    expect(paysText(null)).toBeNull();
  });
  it("links each side to the terminal on that Window", () => {
    expect(sideHref("BTC", "0xabc", "up")).toBe("/trade/BTC?w=0xabc&pick=up");
    expect(sideHref("BTC", null, "down")).toBe("/trade/BTC");
  });
});

describe("lineGeometry", () => {
  const pts = [
    { t: 0, p: 100 },
    { t: 50, p: 110 },
    { t: 100, p: 105 },
  ];
  it("draws the points in the box with the open inside the scale", () => {
    const g = lineGeometry(pts, 200, 100, 90, 100, 100);
    expect(g.d.startsWith("M0.0,")).toBe(true);
    expect(g.last?.x).toBe(200);
    expect(g.openY).not.toBeNull();
    expect(g.openY!).toBeGreaterThan(0);
    expect(g.openY!).toBeLessThan(100);
    expect(g.labels).toHaveLength(3);
  });
  it("draws nothing with no points and no open", () => {
    expect(lineGeometry([], 200, 100, null, 100, 100).d).toBe("");
  });
  it("thins to the cap and keeps the newest", () => {
    const many = Array.from({ length: 500 }, (_, i) => i);
    const out = thin(many, 120);
    expect(out).toHaveLength(120);
    expect(out.at(-1)).toBe(499);
  });
});

describe("smooth", () => {
  it("averages each bucket, the newest too, at its newest tick's time", () => {
    const pts = [{ t: 0, p: 100 }, { t: 1, p: 104 }, { t: 10, p: 200 }, { t: 11, p: 210 }];
    const out = smooth(pts, 0, 20, 2);
    expect(out[0]).toEqual({ t: 1, p: 102 });
    expect(out.at(-1)).toEqual({ t: 11, p: 205 });
  });
});
