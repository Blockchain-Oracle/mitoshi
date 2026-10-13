// R6 #9 (D-230): a rule's and a mirror's decisions, recorded in the decision log an agent's reads land in, so every
// strategy's page counts and shows its real decisions — time, call, result. Before this, only an agent's reads were
// rows: "ETH Mean-reversion" showed 14 copies and 0 decisions, its calls living only in the heartbeat's words.
import { parseStrategyMetadata, ruleCallReason, ruleCallWhy, ruleModelOf, type SkipKind, type StrategySpec } from "@cwf/core";
import type { StrategyStore } from "@cwf/db";
import type { IndexedStrategy } from "@cwf/db/idx";
import type { Scan } from "./decide";

/** "TSLA-24" (the 24/7 feed's spot symbol) reads as the ticker. */
const assetOf = (spotSymbol: string | null) => (spotSymbol ? spotSymbol.replace(/-24$/, "") : null);

/**
 * A rule calls a Window once. The first pass its trigger holds records the call (its time, side and the move in
 * words); every later pass holds to that side, so a Window whose price swings through the other trigger is never called
 * both ways and every copier of it gets the side the record shows. Returns the candidates to execute.
 */
export async function holdRuleCalls(input: { store: StrategyStore; strategy: IndexedStrategy; spec: Exclude<StrategySpec, { preset: "agent" }>; scan: Scan; runner: string; nowMs: number; dryRun: boolean }): Promise<Scan["candidates"]> {
  const { store, strategy: s, spec, scan, runner, nowMs, dryRun } = input;
  const out: Scan["candidates"] = [];
  for (const c of scan.candidates) {
    const side = c.decision.side;
    if (!side) continue;
    const recorded = await store.recordCall({
      strategyId: s.strategyId, marketId: c.window.marketId, runner, model: ruleModelOf(spec.preset === "basket" ? spec.rule.preset : spec.preset), why: ruleCallWhy(spec, assetOf(c.window.spotSymbol), side, spec.preset === "mirror" ? null : c.decision.moveBps),
      gateReason: ruleCallReason(spec, c.decision), side, decidedAtMs: nowMs, dryRun,
    });
    if (recorded) {
      out.push(c);
      continue;
    }
    const prior = await store.decisionOf(s.strategyId, c.window.marketId, dryRun);
    if (!prior || prior.side === side) out.push(c);
  }
  return out;
}

/**
 * Calls made before they were recorded: each Window a rule strategy filled a copier on, with no decision row yet, is
 * recorded from its fills — the side its follows took (a fade's turned back), at its first fill, with how many filled.
 * Idempotent (one row per Window); run once when the runner warms.
 */
export async function backfillCalls(store: StrategyStore, strategies: readonly IndexedStrategy[], runner: string): Promise<number> {
  let added = 0;
  for (const s of strategies) {
    const meta = s.metadata ? parseStrategyMetadata(s.metadata) : null;
    // A theme (D-231) recorded every call from its first pass; there is nothing before it to recover.
    if (!meta || meta.spec.preset === "agent" || meta.spec.preset === "basket") continue;
    const spec = meta.spec;
    const byMarket = new Map<string, Awaited<ReturnType<StrategyStore["listFills"]>>>();
    for (const f of await store.listFills({ strategyId: s.strategyId, limit: 1_000 })) byMarket.set(f.marketId, [...(byMarket.get(f.marketId) ?? []), f]);
    for (const [marketId, fills] of byMarket) {
      if (await store.decisionOf(s.strategyId, marketId, false)) continue;
      const first = fills.reduce((a, b) => (b.atSec < a.atSec ? b : a));
      const side = first.mode === "fade" ? (first.side === "up" ? "down" : "up") : first.side;
      const ok = await store.recordCall({
        strategyId: s.strategyId, marketId, runner, model: ruleModelOf(spec.preset), why: ruleCallWhy(spec, s.seriesSymbol, side, null), gateReason: "recorded from its copies",
        side, decidedAtMs: first.atSec * 1000, filled: fills.length, dryRun: false,
      });
      if (ok) added += 1;
    }
  }
  return added;
}

/** Copiers a pass could not fill, by reason; a copier already in the Window is not a skip (it was filled before). */
export function tallySkips(skips: readonly SkipKind[]): Partial<Record<SkipKind, number>> {
  const out: Partial<Record<SkipKind, number>> = {};
  for (const k of skips) if (k !== "in-window") out[k] = (out[k] ?? 0) + 1;
  return out;
}
