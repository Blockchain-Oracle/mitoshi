/**
 * Themes — pure weight maths (plan S1 1a stub; S16c/S16a extend it; D-002 per-user accounts, Q-025 creator fee cap).
 *
 * A theme is a basket of mirror tokens with target weights in basis points summing to exactly 10,000. The agent
 * proposes weights inside the creator's envelope (Q-003); these helpers keep every weight set exact in integers.
 */
export const WEIGHT_TOTAL_BPS = 10_000;
/** Q-025 default: the creator fee is capped at 50 bps. */
export const CREATOR_FEE_CAP_BPS = 50;

export interface WeightRow {
  symbol: string;
  bps: number;
}

export function isValidWeightSet(rows: readonly WeightRow[]): boolean {
  const symbols = new Set(rows.map((r) => r.symbol));
  return rows.length > 0 && symbols.size === rows.length && rows.every((r) => Number.isInteger(r.bps) && r.bps >= 0) && rows.reduce((s, r) => s + r.bps, 0) === WEIGHT_TOTAL_BPS;
}

/**
 * Integer weights from raw scores (largest remainder): proportional, non-negative, summing to exactly 10,000. Ties in
 * the remainder go to the earlier row, so the result is deterministic.
 */
export function normalizeWeights(scores: readonly { symbol: string; score: bigint }[]): WeightRow[] {
  const total = scores.reduce((s, r) => s + (r.score > 0n ? r.score : 0n), 0n);
  if (total === 0n) throw new Error("at least one positive score is required");
  const exact = scores.map((r) => ({ symbol: r.symbol, num: (r.score > 0n ? r.score : 0n) * BigInt(WEIGHT_TOTAL_BPS) }));
  const rows = exact.map((r) => ({ symbol: r.symbol, bps: Number(r.num / total), rem: r.num % total }));
  let left = WEIGHT_TOTAL_BPS - rows.reduce((s, r) => s + r.bps, 0);
  const order = rows.map((r, i) => ({ i, rem: r.rem })).sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of order) {
    if (left === 0) break;
    rows[i]!.bps += 1;
    left -= 1;
  }
  return rows.map(({ symbol, bps }) => ({ symbol, bps }));
}

export function isValidCreatorFee(bps: number): boolean {
  return Number.isInteger(bps) && bps >= 0 && bps <= CREATOR_FEE_CAP_BPS;
}
