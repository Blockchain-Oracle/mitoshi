// Which Windows a strategy's runner pass reads, and how big a theme's call is (D-219, D-231). Pure.
import type { Hex } from "viem";
import { basketTrades, memberWeightBps, type StrategySpec } from "@cwf/core";
import type { SeriesView } from "@cwf/markets/ops";

export type SeriesRow = Pick<SeriesView, "seriesId" | "symbol" | "lane" | "cadenceSec">;

/**
 * A strategy scoped to a series trades that series; a theme every series of its members on its lanes and cadences —
 * the vault pins a grant to one Window or any, so the runner holds to these, as D-219 does for "any"; "any" scans
 * every crypto 5-minute series.
 */
export function seriesFor(spec: StrategySpec, scoped: string | null, all: readonly SeriesRow[]): Hex[] {
  if (scoped) return [scoped as Hex];
  if (spec.preset === "basket") return all.filter((x) => basketTrades(spec, x)).map((x) => x.seriesId);
  return all.filter((x) => x.lane === "crypto24" && x.cadenceSec === 300).map((x) => x.seriesId);
}

/** A theme's call on one member's Window takes that member's weight of the per-trade cap (`TSLA-24` is TSLA's 24/7
 *  feed); any other strategy's call takes the whole cap (undefined). */
export function weightOf(spec: StrategySpec, spotSymbol: string | null): number | undefined {
  return spec.preset === "basket" ? memberWeightBps(spec, (spotSymbol ?? "").replace(/-24$/, "")) : undefined;
}
