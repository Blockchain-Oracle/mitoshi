// Ported from Masayume 68f7a09:packages/core/src/projection/equity.ts
import { roundSettledAtMs } from "./settle";
import type { SettledRound } from "./types";

export interface EquityPoint {
  /** null only for the seed point at zero, before the first close. */
  atMs: number | null;
  cumulativeBase: bigint;
}

/** Oldest first, so the curve reads left to right the way the rows read top to bottom. */
export function chronological<R extends Pick<SettledRound, "settledAtMs" | "expirySec">>(rounds: readonly R[]): R[] {
  return [...rounds].sort((a, b) => roundSettledAtMs(a) - roundSettledAtMs(b));
}

/** Cumulative net, one step per settled round — it drops on a loss; the drawdown is drawn, never hidden. */
export function equityCurve(rounds: readonly SettledRound[]): EquityPoint[] {
  let cumulative = 0n;
  const points: EquityPoint[] = [{ atMs: null, cumulativeBase: 0n }];
  for (const round of chronological(rounds)) {
    cumulative += round.pnlBase;
    points.push({ atMs: roundSettledAtMs(round), cumulativeBase: cumulative });
  }
  return points;
}

/** Deepest peak-to-trough slide along the curve, as a positive amount (0 when it never fell). */
export function maxDrawdownBase(points: readonly EquityPoint[]): bigint {
  let peak = 0n;
  let deepest = 0n;
  for (const point of points) {
    if (point.cumulativeBase > peak) peak = point.cumulativeBase;
    const slide = peak - point.cumulativeBase;
    if (slide > deepest) deepest = slide;
  }
  return deepest;
}

/** Longest run of consecutive wins, and the run the wallet is on now, over decided rounds only. */
export function winStreaks(rounds: readonly Pick<SettledRound, "outcome" | "settledAtMs" | "expirySec">[]): { best: number; current: number } {
  let best = 0;
  let run = 0;
  for (const round of chronological(rounds)) {
    if (round.outcome === "win") run += 1;
    else if (round.outcome === "loss") run = 0;
    if (run > best) best = run;
  }
  return { best, current: run };
}
