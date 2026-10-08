import { describe, expect, it } from "vitest";
import type { DisplayFeed, DisplayQuote } from "../../display/types";
import { BASIS_MIN_SAMPLES, basisOf, createBasisTracker } from "./basis";

function feed() {
  let listener: ((q: DisplayQuote) => void) | null = null;
  const f: DisplayFeed = { latest: () => null, subscribe: (l) => ((listener = l), () => (listener = null)) };
  return { f, push: (q: DisplayQuote) => listener?.(q) };
}

describe("the display's basis to the signed feed (D-206)", () => {
  it("estimates nothing until it has enough samples, then the mean and its standard error", () => {
    expect(basisOf([1, 2, 3])).toBeNull();
    const e = basisOf(Array.from({ length: 20 }, (_, k) => (k % 2 ? 1 : 3)))!;
    expect(e.meanBps).toBeCloseTo(2, 6);
    expect(e.seBps).toBeCloseTo(Math.sqrt(20 / 19 / 20), 6);
  });

  it("samples a signed value against the display price at its own second, once per publish", () => {
    const { f, push } = feed();
    const t = createBasisTracker(f);
    for (let k = 0; k < BASIS_MIN_SAMPLES; k++) {
      const sec = 1_000 + k * 10;
      push({ symbol: "BTC", priceE8: 8_000_000_000_000n, atMs: sec * 1000 + 300, source: "coinbase" });
      // RedStone reads 1 bp over Coinbase at that second; the same publish twice counts once.
      const signed = BigInt(Math.round(8_000_000_000_000 * Math.exp(1 / 10_000)));
      t.observe("BTC", "BTC", signed, sec);
      const e = t.observe("BTC", "BTC", signed, sec);
      if (k < BASIS_MIN_SAMPLES - 1) expect(e).toBeNull();
      else expect(e!.meanBps).toBeCloseTo(1, 3);
    }
  });

  it("ignores RedStone's own value as display, and a second with no display price", () => {
    const { f, push } = feed();
    const t = createBasisTracker(f);
    push({ symbol: "TSLA", priceE8: 25_000_000_000n, atMs: 5_000_000, source: "redstone" });
    for (let k = 0; k < 30; k++) expect(t.observe("TSLA-24", "TSLA", 25_000_000_000n, 5_000 + k * 10)).toBeNull();
  });
});
