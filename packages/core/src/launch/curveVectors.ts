/**
 * Builds the shared TS↔Solidity curve vectors (`curve.vectors.json`). Deterministic: a seeded generator walks four
 * curves (1, 3, 16 segments and an extreme-price one) through buys and sells of every magnitude, ending with a buy
 * that clips at the end price. `scripts/launch/curve-vectors.ts` writes the file; `curve.test.ts` proves the file is
 * what this builder produces; `contracts/test/tempo/launch/CurveMath.t.sol` replays every step on `CurveMath.sol`.
 * Numbers are decimal strings (they exceed 2^53).
 */
import { type FeeSchedule, type Segment, Q96, buy, derive, feeBps, grossFor, liquidityForQuote, migrationCoinFor, sell, sqrtPriceX96For } from "./curve";

type S = string;
export interface VectorStep { kind: "buy" | "sell"; amount: S; sqrtBefore: S; segBefore: number; out: S; used: S; sqrtAfter: S; segAfter: number }
export interface VectorCurve { name: string; sqrtStart: S; threshold: S; segments: { upper: S; liquidity: S }[]; sqrtEnd: S; curveSupply: S; quoteToEnd: S; migrationFeeBps: number; migrationCoin: S; steps: VectorStep[] }
export interface CurveVectors { note: string; curves: VectorCurve[]; fees: { base: number; start: number; period: number; reduction: number; mode: number; elapsed: S; bps: S }[]; gross: { net: S; bps: S; gross: S }[] }

/** mulberry32 → bigint draws; deterministic across runs and machines. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** A value in [1, max] spread log-uniformly, so tiny and huge amounts both appear. */
  const logAmount = (max: bigint): bigint => {
    const digits = max.toString().length;
    const d = 1 + Math.floor(next() * digits);
    const cap = 10n ** BigInt(d);
    const v = (BigInt(Math.floor(next() * 1e9)) * cap) / 1_000_000_000n + 1n;
    return v > max ? max : v;
  };
  return { next, logAmount };
}

/** Segments whose uppers follow `prices` (pathUSD per coin as num/den) and each take `quotePer` pathUSD. */
function segmentsFor(sqrtStart: bigint, uppers: bigint[], quotes: bigint[]): Segment[] {
  let lower = sqrtStart;
  return uppers.map((u, i) => {
    const s = { sqrtPriceUpperX96: u, liquidity: liquidityForQuote(lower, u, quotes[i]!) };
    lower = u;
    return s;
  });
}

function walk(name: string, sqrtStart: bigint, segs: Segment[], threshold: bigint, migrationFeeBps: number, seed: number, trades: number): VectorCurve {
  const d = derive(sqrtStart, segs, threshold);
  const r = rng(seed);
  const steps: VectorStep[] = [];
  let sqrtP = sqrtStart;
  let seg = 0;
  let held = 0n;
  let reserve = 0n;
  const push = (kind: "buy" | "sell", amount: bigint, out: bigint, used: bigint, sqrtAfter: bigint, segAfter: number) => {
    steps.push({ kind, amount: amount.toString(), sqrtBefore: sqrtP.toString(), segBefore: seg, out: out.toString(), used: used.toString(), sqrtAfter: sqrtAfter.toString(), segAfter });
    sqrtP = sqrtAfter;
    seg = segAfter;
  };
  for (let i = 0; i < trades; i++) {
    if (held > 0n && r.next() < 0.4) {
      const amount = r.next() < 0.15 ? held : r.logAmount(held);
      const s = sell(segs, sqrtStart, sqrtP, seg, amount);
      held -= amount;
      reserve -= s.quoteOut;
      push("sell", amount, s.quoteOut, amount, s.sqrtNext, s.segNext);
    } else {
      const left = d.quoteToEnd - reserve;
      if (left <= 1n) break;
      const amount = r.logAmount(left - 1n);
      const b = buy(segs, d.sqrtEnd, sqrtP, seg, amount);
      if (b.coinOut === 0n) continue;
      held += b.coinOut;
      reserve += b.quoteUsed;
      push("buy", amount, b.coinOut, b.quoteUsed, b.sqrtNext, b.segNext);
      if (b.sqrtNext === d.sqrtEnd) break;
    }
  }
  if (sqrtP !== d.sqrtEnd) {
    const amount = d.quoteToEnd * 2n; // more than enough: clips at the end
    const b = buy(segs, d.sqrtEnd, sqrtP, seg, amount);
    push("buy", amount, b.coinOut, b.quoteUsed, b.sqrtNext, b.segNext);
  }
  return {
    name,
    sqrtStart: sqrtStart.toString(),
    threshold: threshold.toString(),
    segments: segs.map((s) => ({ upper: s.sqrtPriceUpperX96.toString(), liquidity: s.liquidity.toString() })),
    sqrtEnd: d.sqrtEnd.toString(),
    curveSupply: d.curveSupply.toString(),
    quoteToEnd: d.quoteToEnd.toString(),
    migrationFeeBps,
    migrationCoin: migrationCoinFor(d.quoteToEnd, migrationFeeBps, d.sqrtEnd).toString(),
    steps,
  };
}

export function buildCurveVectors(): CurveVectors {
  const curves: VectorCurve[] = [];
  // 1 segment: $0.000001 → $0.000015 per coin, 5,000 pathUSD threshold.
  const s1 = sqrtPriceX96For(1n, 1_000_000n);
  const e1 = sqrtPriceX96For(15n, 1_000_000n);
  curves.push(walk("one-segment", s1, segmentsFor(s1, [e1], [6_000_000_000n]), 5_000_000_000n, 100, 1, 40));
  // 3 segments, rising liquidity (a steeper start).
  const s3 = sqrtPriceX96For(1n, 100_000n);
  const u3 = [sqrtPriceX96For(3n, 100_000n), sqrtPriceX96For(8n, 100_000n), sqrtPriceX96For(40n, 100_000n)];
  curves.push(walk("three-segments", s3, segmentsFor(s3, u3, [300_000_000n, 1_200_000_000n, 9_000_000_000n]), 8_000_000_000n, 0, 7, 60));
  // 16 segments (the maximum), each ×1.25 in price.
  const s16 = sqrtPriceX96For(1n, 10_000_000n);
  const u16 = Array.from({ length: 16 }, (_, i) => sqrtPriceX96For(125n ** BigInt(i + 1), 100n ** BigInt(i + 1) * 10_000_000n));
  const q16 = Array.from({ length: 16 }, (_, i) => 50_000_000n * BigInt(i + 1));
  curves.push(walk("sixteen-segments", s16, segmentsFor(s16, u16, q16), 6_400_000_000n, 250, 42, 80));
  // Extreme prices: 1e-12 pathUSD per coin (≈ 2^76) up to 1e-9, tiny liquidity → heavy rounding.
  const sx = Q96 / 1_000_000n;
  const ex = Q96 / 31_622n;
  curves.push(walk("extreme-low-price", sx, segmentsFor(sx, [ex], [2_000_000n]), 1_500_000n, 5_000, 99, 50));

  const schedules: FeeSchedule[] = [
    { base: 100, start: 100, period: 0, reduction: 0, mode: 0 },
    { base: 100, start: 5_000, period: 10, reduction: 250, mode: 0 },
    { base: 50, start: 4_000, period: 5, reduction: 1_500, mode: 1 },
    { base: 0, start: 1_000, period: 1, reduction: 9_999, mode: 1 },
  ];
  const elapsed = [0n, 1n, 9n, 10n, 11n, 55n, 100n, 199n, 200n, 1_000n, 1_300n, 1_000_000n];
  const fees = schedules.flatMap((f) => elapsed.map((e) => ({ ...f, elapsed: e.toString(), bps: feeBps(f, e).toString() })));
  const gross: CurveVectors["gross"] = [];
  for (const bps of [0n, 1n, 30n, 100n, 2_500n, 5_000n]) for (const net of [1n, 7n, 999n, 1_000_003n, 123_456_789_012n]) gross.push({ net: net.toString(), bps: bps.toString(), gross: grossFor(net, bps).toString() });
  return { note: "Generated by scripts/launch/curve-vectors.ts from packages/core/src/launch/curveVectors.ts — do not edit.", curves, fees, gross };
}
