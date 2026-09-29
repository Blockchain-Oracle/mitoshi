// Ported from Masayume 68f7a09:packages/core/src/strategies/model.ts
import type { Decision, OracleFollowSpec } from "./types";

const BPS = 10_000n;

/** Signed move of `now` from `from`, in bps, on the feed's raw scale. */
export function moveBps(fromRaw: bigint, nowRaw: bigint): number {
  if (fromRaw <= 0n) return 0;
  return Number(((nowRaw - fromRaw) * BPS) / fromRaw);
}

/**
 * The house model, "oracle-follow": the Window settles against its opening print, so the
 * reference the runner reads is that print versus the fresh feed. Past the threshold it follows
 * the move (momentum) or fades it (reversion); inside the threshold it sits out. Pure.
 */
export function decideOracleFollow(input: { openingRaw: bigint; priceRaw: bigint; spec: OracleFollowSpec }): Decision {
  const { openingRaw, priceRaw, spec } = input;
  const move = moveBps(openingRaw, priceRaw);
  if (openingRaw <= 0n || priceRaw <= 0n) return { side: null, moveBps: 0, thresholdBps: spec.thresholdBps, reason: "no print or no price to read" };
  if (Math.abs(move) < spec.thresholdBps) {
    return { side: null, moveBps: move, thresholdBps: spec.thresholdBps, reason: `moved ${move} bps, under the ${spec.thresholdBps} bps threshold` };
  }
  const trend = move > 0 ? "up" : "down";
  const side = spec.preset === "momentum" ? trend : trend === "up" ? "down" : "up";
  return { side, moveBps: move, thresholdBps: spec.thresholdBps, reason: `moved ${move} bps from the print; ${spec.preset} bets ${side}` };
}

/**
 * The reference's preset over a price series: the move across the last `lookback` samples.
 * Used when a Window has no print yet; otherwise the print is the honest reference.
 */
export function decideFromSeries(input: { pricesRaw: readonly bigint[]; spec: OracleFollowSpec }): Decision {
  const { pricesRaw, spec } = input;
  const window = pricesRaw.slice(-spec.lookback);
  const first = window[0];
  const last = window[window.length - 1];
  if (window.length < 2 || first === undefined || last === undefined) {
    return { side: null, moveBps: 0, thresholdBps: spec.thresholdBps, reason: `needs ${spec.lookback} prices, has ${window.length}` };
  }
  return decideOracleFollow({ openingRaw: first, priceRaw: last, spec });
}

/** How far the nearest trigger is: the reference's heartbeat says "closest trigger N bps away". */
export function distanceToTriggerBps(decision: Decision): number {
  return Math.max(0, decision.thresholdBps - Math.abs(decision.moveBps));
}
