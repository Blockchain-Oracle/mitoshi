import { describe, expect, it } from "vitest";
import vectors from "./curve.vectors.json";
import { buildCurveVectors } from "./curveVectors";
import { CurveError, Q96, amount0Delta, amount1Delta, buy, derive, feeBps, grossFor, isqrt, progressBps, quoteBuy, quoteSell, sell, sqrtPriceX96For, v4SqrtPrice, type Segment } from "./curve";

describe("shared vectors (also replayed by contracts/test/tempo/launch/CurveMath.t.sol)", () => {
  it("the committed curve.vectors.json is exactly what the builder produces", () => {
    expect(JSON.parse(JSON.stringify(buildCurveVectors()))).toEqual(vectors);
  });

  it("every step replays from its own inputs", () => {
    for (const c of vectors.curves) {
      const segs: Segment[] = c.segments.map((s) => ({ sqrtPriceUpperX96: BigInt(s.upper), liquidity: BigInt(s.liquidity) }));
      const d = derive(BigInt(c.sqrtStart), segs, BigInt(c.threshold));
      expect(d.sqrtEnd.toString()).toBe(c.sqrtEnd);
      for (const s of c.steps) {
        if (s.kind === "buy") {
          const r = buy(segs, d.sqrtEnd, BigInt(s.sqrtBefore), s.segBefore, BigInt(s.amount));
          expect([r.coinOut, r.quoteUsed, r.sqrtNext].map(String)).toEqual([s.out, s.used, s.sqrtAfter]);
        } else {
          const r = sell(segs, BigInt(c.sqrtStart), BigInt(s.sqrtBefore), s.segBefore, BigInt(s.amount));
          expect([r.quoteOut, r.sqrtNext].map(String)).toEqual([s.out, s.sqrtAfter]);
        }
      }
    }
  });
});

describe("curve properties", () => {
  const START = Q96 / 1000n;
  const MID = START * 2n;
  const TOP = START * 5n;
  const segs: Segment[] = [
    { sqrtPriceUpperX96: MID, liquidity: 10n ** 15n },
    { sqrtPriceUpperX96: TOP, liquidity: 3n * 10n ** 14n },
  ];
  const full = amount1Delta(START, MID, 10n ** 15n, true) + amount1Delta(MID, TOP, 3n * 10n ** 14n, true);
  const d = derive(START, segs, full);

  it("ends exactly at the last upper when the threshold is the whole curve", () => {
    expect(d.sqrtEnd).toBe(TOP);
  });

  it("buy then sell never profits (deterministic sweep)", () => {
    for (let pre = 0n; pre < full; pre += full / 37n) {
      const a = buy(segs, d.sqrtEnd, START, 0, pre);
      for (const q of [1n, 999n, 10n ** 6n, 10n ** 9n, full / 3n]) {
        const b = buy(segs, d.sqrtEnd, a.sqrtNext, a.segNext, q);
        if (b.coinOut === 0n) continue;
        const s = sell(segs, START, b.sqrtNext, b.segNext, b.coinOut);
        expect(s.quoteOut <= b.quoteUsed).toBe(true);
      }
    }
  });

  it("coin sold never exceeds the curve integral", () => {
    const b = buy(segs, d.sqrtEnd, START, 0, full * 2n);
    expect(b.sqrtNext).toBe(TOP);
    expect(b.coinOut <= amount0Delta(START, MID, 10n ** 15n, true) + amount0Delta(MID, TOP, 3n * 10n ** 14n, true)).toBe(true);
    expect(b.coinOut <= d.curveSupply).toBe(true);
  });

  it("quotes mirror the contract views (fee on the pathUSD side, clipped buys pay only what they use)", () => {
    const shape = { segments: segs, sqrtStartX96: START, sqrtEndX96: d.sqrtEnd };
    const q = quoteBuy(shape, { sqrtPriceX96: START, segment: 0 }, 100n, full * 3n);
    expect(q.completes).toBe(true);
    expect(q.quotePaid < full * 3n).toBe(true);
    expect(q.quotePaid - q.fee <= full).toBe(true);
    const s = quoteSell(shape, { sqrtPriceX96: q.sqrtNext, segment: q.segNext }, 100n, q.coinOut / 2n);
    expect(s.quoteOut > 0n && s.fee > 0n).toBe(true);
    expect(progressBps(full / 2n, full)).toBe(5000);
  });

  it("refuses bad curves by name", () => {
    expect(() => derive(START, segs, full * 10n)).toThrow(CurveError);
    expect(() => derive(START, segs, 10n)).toThrow("TrailingSegments");
    expect(() => sell(segs, START, MID, 0, 10n ** 18n)).toThrow("BeyondCurveStart");
  });

  it("fees, gross-up and helpers", () => {
    expect(feeBps({ base: 100, start: 5000, period: 10, reduction: 250, mode: 0 }, 19n)).toBe(4750n);
    expect(grossFor(99n, 100n)).toBe(100n);
    expect(isqrt(10n ** 40n)).toBe(10n ** 20n);
    expect(isqrt((1n << 200n) + 12345n)).toBe(1n << 100n);
    expect(sqrtPriceX96For(1n, 1_000_000n)).toBe(Q96 / 1000n);
    expect(v4SqrtPrice(Q96)).toBe(Q96);
  });
});
