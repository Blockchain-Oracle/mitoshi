// Ported from Agari 03b30ab:services/ops/src/actors/strategy-runner/mirror-scan.ts — the trader's calls come from
// Mitoshi's index (engine fills taken or made, and Trading Balance executions not made by a STRATEGY grant's runner,
// `readTraderCalls`), over the strategy's own series.
import { decideMirror, type LedgerFill, type MirrorSpec } from "@cwf/core";
import type { TraderCall } from "@cwf/db/idx";
import type { RunnerWindow } from "@cwf/markets/ops";
import type { Scan } from "./decide";

const SIDES: readonly LedgerFill["side"][] = ["BUY_YES", "SELL_YES", "BUY_NO", "SELL_NO"];

export const ledgerOf = (c: TraderCall): LedgerFill => ({
  marketId: c.market as LedgerFill["marketId"], side: SIDES[c.kind]!, quantityRaw: BigInt(c.quantityRaw), yesPriceRaw: 0n, atMs: c.atSec * 1000, txHash: c.txHash as LedgerFill["txHash"],
});

/**
 * One read for a copy-a-trader strategy (A-3b): every trading Window of its series that wallet has just taken a side
 * on. Reads only. A Window the trader has not touched is not a decision to sit out, it is simply not a candidate; the
 * why says how many Windows they were quiet on, so a subscriber can tell a resting trader from a broken runner.
 */
export function scanMirror(windows: readonly RunnerWindow[], spec: MirrorSpec, calls: readonly TraderCall[], nowMs: number): Scan {
  const candidates: Scan["candidates"] = [];
  let quiet = 0;
  for (const window of windows) {
    const own = calls.filter((c) => c.market.toLowerCase() === window.marketId.toLowerCase()).map(ledgerOf);
    const decision = decideMirror({ fills: own, spec, nowMs });
    if (decision.side) candidates.push({ window, decision });
    else quiet += 1;
  }
  const short = `${spec.trader.slice(0, 6)}…${spec.trader.slice(-4)}`;
  const why =
    candidates.length > 0
      ? `scanned ${windows.length} Window${windows.length === 1 ? "" : "s"}, ${short} is net on ${candidates.length} (${candidates.map((c) => `${c.window.spotSymbol} ${c.decision.side}`).join(", ")})`
      : `scanned ${windows.length} Window${windows.length === 1 ? "" : "s"}, ${short} has taken no side in the last ${spec.withinSec}s (${quiet} quiet)`;
  return { candidates, scanned: windows.length, closestBps: null, why };
}
