import { describe, expect, it } from "vitest";
import { fairYesTicks, TRADING_YEAR_SEC } from "./fair";
import { divergenceGuard, DISPLAY_FRESH_MS, type GuardInput } from "./guard";
import { needsRequote } from "./quote";

const NOW_MS = 1_800_000_000_000;
const OPEN = 25_000_000_000n; // $250.00
const fairAt = (spotE8: bigint) => fairYesTicks({ spotE8, openE8: OPEN, secondsLeft: 600, sigmaBps: 4_500, minTick: 10 });
const base = (displayE8: bigint | null, extra: Partial<GuardInput> = {}): GuardInput => ({
  signedE8: OPEN,
  signedAtSec: NOW_MS / 1000 - 8,
  display: displayE8 === null ? null : { symbol: "TSLA", priceE8: displayE8, atMs: NOW_MS - 500, source: "alpaca" },
  nowMs: NOW_MS,
  sigmaBps: 4_500,
  yearSec: TRADING_YEAR_SEC,
  fairTicks: fairAt(OPEN),
  fairAt,
  halfSpreadTicks: 30,
  ...extra,
});

describe("the seed maker's divergence guard", () => {
  it("changes nothing without a fresh fast display quote", () => {
    expect(divergenceGuard(base(null))).toEqual({ action: "quote", fairTicks: fairAt(OPEN), halfSpreadTicks: 30, note: null });
    expect(divergenceGuard(base(25_050_000_000n, { nowMs: NOW_MS + DISPLAY_FRESH_MS + 1 }))).toMatchObject({ halfSpreadTicks: 30 });
    const redstone = base(25_050_000_000n);
    redstone.display = { ...redstone.display!, source: "redstone" };
    expect(divergenceGuard(redstone)).toMatchObject({ halfSpreadTicks: 30 });
  });

  it("spans both fairs: the bid a half spread under the lower, the ask a half spread over the higher", () => {
    const g = divergenceGuard(base(25_010_000_000n)); // +4 bps
    const signed = fairAt(OPEN);
    const display = fairAt(25_010_000_000n);
    expect(display).toBeGreaterThan(signed);
    if (g.action !== "quote") throw new Error("expected a quote");
    expect(g.fairTicks - g.halfSpreadTicks).toBeLessThanOrEqual(signed - 30); // the bid: no higher than before
    expect(g.fairTicks - g.halfSpreadTicks).toBeGreaterThanOrEqual(signed - 31); // …and no lower (the safe side stays)
    expect(g.fairTicks + g.halfSpreadTicks).toBeGreaterThanOrEqual(display + 30); // the ask: clear of the display fair
    expect(g.fairTicks + g.halfSpreadTicks).toBeLessThanOrEqual(display + 31);
    // The resting pair was placed at ±30: the wider ask forces a requote even though the signed fair didn't move.
    expect(needsRequote({ placed: { fairTicks: signed, expireSec: 9e9, halfSpreadTicks: 30 }, fairTicks: g.fairTicks, nowSec: 0, requoteTicks: 1_000, halfSpreadTicks: g.halfSpreadTicks })).toBe(true);
  });

  it("pulls when the feeds disagree past the basis floor and 6σ of the lag", () => {
    const g = divergenceGuard(base(25_250_000_000n)); // +100 bps in ~10 s
    expect(g.action).toBe("pull");
    expect(g.note).toMatch(/alpaca 100 bps off the signed value/);
    // 20 bps is inside the basis floor: widen, don't pull.
    expect(divergenceGuard(base(25_050_000_000n)).action).toBe("quote");
  });

  it("centres on the display carried by its measured basis, and widens only by what that estimate can be off by (D-206)", () => {
    const basis = { meanBps: 1, seBps: 0.2, samples: 60 };
    const display = 25_010_000_000n; // +4 bps over a signed value 8 s old
    const g = divergenceGuard(base(display, { basis }));
    if (g.action !== "quote") throw new Error("expected a quote");
    const estimate = BigInt(Math.round(Number(display) * Math.exp(1 / 10_000)));
    expect(g.fairTicks).toBe(fairAt(estimate));
    const envelope = divergenceGuard(base(display));
    if (envelope.action !== "quote") throw new Error("expected a quote");
    expect(g.halfSpreadTicks).toBeGreaterThanOrEqual(30);
    expect(g.halfSpreadTicks).toBeLessThan(envelope.halfSpreadTicks);
    expect(g.note).toMatch(/alpaca \+1\.0 bps basis/);
  });

  it("still pulls on feeds that disagree, basis or not", () => {
    expect(divergenceGuard(base(25_250_000_000n, { basis: { meanBps: 0.5, seBps: 0.1, samples: 60 } })).action).toBe("pull");
  });
});
