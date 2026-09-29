// Ported from Masayume 68f7a09:packages/core/src/sizing/cost-cap.ts
import { BPS_DENOMINATOR, COST_CAP_ANCHORS } from "../constants/sizing";

/**
 * Buffer over the fresh quote that a fill may never exceed, interpolated linearly by cadence
 * and clamped to the anchor values outside the range — never extrapolated below 1×.
 * The cap itself is `Quote.maxCostBase`: the escrow the SDK locks at the buffered limit.
 */
export function costCapBufferBps(intervalSec: number): number {
  const { fromSec, fromBufferBps, toSec, toBufferBps } = COST_CAP_ANCHORS;
  if (intervalSec <= fromSec) return fromBufferBps;
  if (intervalSec >= toSec) return toBufferBps;
  const progress = (intervalSec - fromSec) / (toSec - fromSec);
  return Math.round(fromBufferBps + (toBufferBps - fromBufferBps) * progress);
}

/** The SDK expresses the crossing cushion as slippage over the quote; our buffer is 1 + slippage. */
export function bufferToSlippageBps(bufferBps: number): number {
  return bufferBps - BPS_DENOMINATOR;
}
