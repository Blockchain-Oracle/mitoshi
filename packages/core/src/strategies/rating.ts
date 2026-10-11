/**
 * The agent rater's score for one UTC day (S9.6, AG-15, D-218.6): the return on stake of the agent's own calls that
 * settled that day — follow fills only (a fade is the subscriber's bet against the agent). A fill pays its tokens at the
 * Window's payout numerator for its side (the engine's redeem: `tokens × numerator / 10,000,000`; a void returns what
 * the numerators say). The ERC-8004 feedback value is that return in percent with two decimals (`valueDecimals` 2:
 * 1234 = +12.34%), tagged `pnl` and the day; the evidence is a self-contained JSON whose keccak the feedback carries.
 */
export const PAYOUT_DENOMINATOR = 10_000_000n;
export const RATING_TAG = "pnl";
const MAX_EVIDENCE_FILLS = 50;

export interface SettledFill {
  txHash: string;
  cashDeltaBase: bigint;
  tokenDeltaRaw: bigint;
  /** The Window's payout numerator for the fill's side, out of `PAYOUT_DENOMINATOR`. */
  payoutNumerator: bigint;
}

export interface DayRating {
  day: string;
  settled: number;
  stakedBase: bigint;
  netBase: bigint;
  /** Signed return on stake in hundredths of a percent; null when nothing was staked. */
  valueCentiPct: bigint | null;
}

/** `YYYY-MM-DD` of a unix second, UTC. */
export function utcDayLabel(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export function rateDay(day: string, fills: readonly SettledFill[]): DayRating {
  let stakedBase = 0n;
  let netBase = 0n;
  for (const f of fills) {
    const payout = (f.tokenDeltaRaw * f.payoutNumerator) / PAYOUT_DENOMINATOR;
    stakedBase += f.cashDeltaBase;
    netBase += payout - f.cashDeltaBase;
  }
  return { day, settled: fills.length, stakedBase, netBase, valueCentiPct: stakedBase > 0n ? (netBase * 10_000n) / stakedBase : null };
}

/** The evidence a feedback points at: what was scored, so anyone can recompute the value. */
export function ratingEvidence(input: { agentId: bigint; strategyId: string; rating: DayRating; fills: readonly SettledFill[] }): string {
  const r = input.rating;
  return JSON.stringify({
    v: 1, kind: "mitoshi-agent-day", agentId: input.agentId.toString(), strategyId: input.strategyId, day: r.day, settled: r.settled,
    stakedBase: r.stakedBase.toString(), netBase: r.netBase.toString(), valueCentiPct: r.valueCentiPct?.toString() ?? null,
    fills: input.fills.slice(0, MAX_EVIDENCE_FILLS).map((f) => f.txHash),
  });
}
