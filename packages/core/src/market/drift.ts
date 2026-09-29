// Ported from Agari 03b30ab:packages/core/src/market/drift.ts
/** One sample of the settlement feed. */
export interface DriftPoint {
  timeSec: number;
  valueRaw: bigint;
}

export interface Drift {
  /** Movement across the span actually held, in the oracle's raw scale. */
  moveRaw: bigint;
  /** The span the reading really covers — never more than the history holds. */
  spanMin: number;
  direction: "up" | "down" | "flat";
}

const SEC_PER_MIN = 60;

/**
 * Directional drift over a window — ported from `computeDrift` in
 * `reference/yosuku/components/SenseiTape.tsx`.
 *
 * Two honest properties are the point of it, and both are the reference's own:
 *
 *  - It is measured on the **same feed that settles Windows**, so the number
 *    Sensei reasons from is the number that will decide the bet.
 *  - `spanMin` is the span the samples actually cover, not the span asked for. A
 *    minute-old history asked for a 15-minute drift reports 1, so the label under
 *    it cannot claim a window the data does not have.
 *
 * `flatBandRaw` is the movement below which this reads as flat rather than as a
 * direction. The reference hardcodes $3 on BTC; it is a parameter here because the
 * venue lists assets whose whole price is smaller than that.
 */
export function computeDrift(points: readonly DriftPoint[], windowMin: number, flatBandRaw: bigint): Drift | null {
  if (points.length < 2) return null;

  const latest = points[points.length - 1]!;
  const cutoffSec = latest.timeSec - windowMin * SEC_PER_MIN;
  const earliest = points.find((point) => point.timeSec >= cutoffSec) ?? points[0]!;

  const moveRaw = latest.valueRaw - earliest.valueRaw;
  const magnitude = moveRaw < 0n ? -moveRaw : moveRaw;

  return {
    moveRaw,
    spanMin: Math.max(0, Math.round((latest.timeSec - earliest.timeSec) / SEC_PER_MIN)),
    direction: magnitude <= flatBandRaw ? "flat" : moveRaw > 0n ? "up" : "down",
  };
}
