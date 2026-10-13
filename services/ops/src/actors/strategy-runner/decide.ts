// Ported from Masayume 68f7a09:services/ops/src/actors/strategy-runner/decide.ts — the venue's lanes become the
// strategy's own series (its envelope scope, D-219.1), the price is the process's RedStone spot (the same feed the
// Windows settle on), the opening print the engine's own.
import { decideOracleFollow, distanceToTriggerBps, type Decision, type OracleFollowSpec } from "@cwf/core";
import type { RunnerWindow } from "@cwf/markets/ops";

export interface Candidate {
  window: RunnerWindow;
  decision: Decision;
}

export interface Scan {
  /** Windows the runner could act on this cycle, each with its decision. */
  candidates: Candidate[];
  scanned: number;
  closestBps: number | null;
  why: string;
  /** Set when the scan could not read at all (an agent with no model configured). */
  idle?: "no-brain";
}

/** The latest spot for a symbol no older than the feed's freshness bound, or null. */
export type SpotAt = (symbol: string) => { priceE8: bigint } | null;

/**
 * The house model on every trading Window of the strategy's series: the move from the Window's opening print to the
 * fresh spot, past the threshold → the side (momentum follows it, reversion fades it). Reads only — nothing here sends.
 */
export function scanOracleFollow(windows: readonly RunnerWindow[], spec: OracleFollowSpec, spot: SpotAt): Scan {
  const candidates: Candidate[] = [];
  let closest: number | null = null;
  const skipped: string[] = [];
  for (const window of windows) {
    const price = window.spotSymbol ? spot(window.spotSymbol) : null;
    if (!price) {
      skipped.push(`${window.spotSymbol ?? "?"} #${window.index}: no fresh price`);
      continue;
    }
    const decision = decideOracleFollow({ openingRaw: window.openPriceE8, priceRaw: price.priceE8, spec });
    const distance = distanceToTriggerBps(decision);
    if (closest === null || distance < closest) closest = distance;
    if (decision.side) candidates.push({ window, decision });
  }
  const why =
    candidates.length > 0
      ? `scanned ${windows.length} Window${windows.length === 1 ? "" : "s"}, ${candidates.length} past the trigger (${candidates.map((c) => `${c.window.spotSymbol} ${c.decision.moveBps} bps → ${c.decision.side}`).join(", ")})`
      : windows.length === 0
        ? "no trading Window with an open print in this series right now"
        : `scanned ${windows.length} Window${windows.length === 1 ? "" : "s"}, closest trigger ${closest ?? "—"} bps away${skipped.length ? `; ${skipped.length} skipped (${skipped[0]})` : ""}`;
  return { candidates, scanned: windows.length, closestBps: closest, why };
}
