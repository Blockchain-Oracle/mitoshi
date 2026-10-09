// The Account drawer's P&L line and curve (RV-81, Tradash F §7 "Balance card"): realised P&L of the rounds closed or
// settled inside a range (24H / 7D / 30D / All), what those rounds staked, and the cumulative realised curve sampled at
// evenly spaced instants across the range (Tradash draws 64). Integer base units throughout; the drawing scales them.
// A round counts at the instant core's projection settles it (`roundSettledAtMs`), as the history and /portfolio's
// record curve do.
import { roundSettledAtMs, type SettledRound } from "@cwf/core";

export type PnlRange = "24H" | "7D" | "30D" | "All";
export const PNL_RANGES: readonly PnlRange[] = ["24H", "7D", "30D", "All"];
const DAY_MS = 86_400_000;
const SPAN_MS: Record<PnlRange, number | null> = { "24H": DAY_MS, "7D": 7 * DAY_MS, "30D": 30 * DAY_MS, All: null };

export interface RangePnl {
  /** Realised P&L of the rounds inside the range. */
  realizedBase: bigint;
  /** What those rounds staked (the ROI's denominator, with whatever is open now). */
  stakedBase: bigint;
  /** Rounds inside the range. */
  count: number;
  /** Cumulative realised P&L at `points` evenly spaced instants from the range's start to now. */
  curve: bigint[];
}

export function pnlInRange(rounds: readonly Pick<SettledRound, "settledAtMs" | "expirySec" | "pnlBase" | "stakeBase">[], range: PnlRange, nowMs: number, points = 64): RangePnl {
  const timed = rounds.map((r) => ({ atMs: roundSettledAtMs(r), pnlBase: r.pnlBase, stakeBase: r.stakeBase })).sort((a, b) => a.atMs - b.atMs);
  const span = SPAN_MS[range];
  const startMs = span === null ? (timed[0]?.atMs ?? nowMs) : nowMs - span;
  const inside = timed.filter((r) => r.atMs >= startMs && r.atMs <= nowMs);
  const realizedBase = inside.reduce((s, r) => s + r.pnlBase, 0n);
  const stakedBase = inside.reduce((s, r) => s + r.stakeBase, 0n);
  const curve: bigint[] = [];
  const n = Math.max(2, points);
  let at = 0;
  let sum = 0n;
  for (let i = 0; i < n; i += 1) {
    const t = startMs + ((nowMs - startMs) * i) / (n - 1);
    while (at < inside.length && inside[at]!.atMs <= t) sum += inside[at++]!.pnlBase;
    curve.push(sum);
  }
  return { realizedBase, stakedBase, count: inside.length, curve };
}

/** Return in basis points on what was staked in the range plus what is open now; null with nothing staked. */
export function rangeRoiBps(totalPnlBase: bigint, stakedBase: bigint, openCostBase: bigint): number | null {
  const denominator = stakedBase + openCostBase;
  return denominator > 0n ? Number((totalPnlBase * 10_000n) / denominator) : null;
}
