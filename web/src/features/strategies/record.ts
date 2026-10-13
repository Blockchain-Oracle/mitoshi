// The record's two derived figures (R4-6, D-227; Owarine 90a91d71 RecordCard): the win rate and the curve's points.
import type { EquityPoint } from "@cwf/core";
import type { RecordWire } from "./protocol";

/** Wins over decided (won + lost) trades, a whole percent; voids don't count either way. */
export function winRateOf(record: Pick<RecordWire, "wins" | "losses">): number | null {
  const decided = record.wins + record.losses;
  return decided > 0 ? Math.round((100 * record.wins) / decided) : null;
}

/** The cumulative net from zero, one point per settled trade (the EquitySparkline's input). */
export function curvePoints(record: Pick<RecordWire, "curve">): EquityPoint[] {
  return [{ atMs: null, cumulativeBase: 0n }, ...record.curve.map((p) => ({ atMs: p.atSec * 1000, cumulativeBase: BigInt(p.cumBase) }))];
}
