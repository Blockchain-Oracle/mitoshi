// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/window-roller/{plan-gap,plan-token,plan-basis}.ts
// (xStock token lanes → the 24/7 lanes on RedStone `<T>---24_7` and crypto; the Gap's weekend reference is unchanged).
/**
 * Gap and 24/7 planners and the basis dispatch. Pure, like `plan.ts`.
 * - Gap: the earliest `gapWindows` candidate inside `gapLeadSec`; a Gap past its check bound still lists (single source).
 * - 24/7 (`stock24`, `crypto24`): `tokenWindows` back to back with no calendar; after downtime the next aligned Window
 *   that can still take its opening print.
 */
import { gapWindows, tokenWindows, type ScheduledWindow } from "@cwf/core";
import { decide, PRINT_MARGIN_SEC, planSeries, spanOf, type PlanClock, type PlanSeries, type SeriesPlan } from "./plan";
import { highestCoveringVersion, openPrintsAdmissible } from "./versions";

const day = (sec: number) => new Date(sec * 1000).toISOString().slice(5, 16).replace("T", " ");
export const gapSpanOf = (w: { tradingStartSec: number; expirySec: number }) => `${day(w.tradingStartSec)}Z–${day(w.expirySec)}Z`;

export function nextGapCandidate(series: PlanSeries, clock: PlanClock): ScheduledWindow | null {
  if (!clock.calendar) return null;
  return (
    gapWindows(clock.calendar).find((w) => {
      if (w.tradingStartSec < series.lastExpirySec || w.lockAtSec - clock.nowSec < clock.minTradableSec) return false;
      const version = highestCoveringVersion(series.versions, w.tradingStartSec, w.expirySec);
      return version === null || openPrintsAdmissible({ ...series.versions[version]!, checkSource: 0 }, w, clock.nowSec, PRINT_MARGIN_SEC);
    }) ?? null
  );
}

export function planGapSeries(series: PlanSeries, clock: PlanClock): SeriesPlan {
  if (!clock.calendar) return { kind: "closed", wakeSec: null, state: "closed: no calendar" };
  const w = nextGapCandidate(series, clock);
  if (!w) return { kind: "closed", wakeSec: null, state: "closed: no weekend in the calendar" };
  const listSec = w.tradingStartSec - clock.gapLeadSec;
  if (clock.nowSec < listSec) return { kind: "wait", window: w, wakeSec: listSec, state: `waiting: lists ${day(listSec)}Z for ${gapSpanOf(w)}` };
  return decide(series, clock, w, `opening ${gapSpanOf(w)}`);
}

/** The earliest 24/7 Window at or after `lastExpiry` that can still be opened and take its opening print. */
export function nextTokenCandidate(series: PlanSeries, clock: PlanClock): ScheduledWindow {
  const cadence = series.cadenceSec;
  const from = Math.max(series.lastExpirySec, clock.nowSec - cadence);
  const windows = tokenWindows(from, Math.max(from, clock.nowSec) + clock.leadSec + 2 * cadence, cadence);
  const ok = windows.find((w) => {
    if (w.tradingStartSec < series.lastExpirySec || w.lockAtSec - clock.nowSec < clock.minTradableSec) return false;
    const version = highestCoveringVersion(series.versions, w.tradingStartSec, w.expirySec);
    return version === null || openPrintsAdmissible(series.versions[version]!, w, clock.nowSec, PRINT_MARGIN_SEC);
  });
  return ok ?? windows.at(-1)!;
}

export function planTokenSeries(series: PlanSeries, clock: PlanClock): SeriesPlan {
  const w = nextTokenCandidate(series, clock);
  if (w.tradingStartSec - clock.nowSec > clock.leadSec) return { kind: "wait", window: w, wakeSec: w.tradingStartSec - clock.leadSec, state: `waiting: next ${spanOf(w)}` };
  return decide(series, clock, w, `opening ${spanOf(w)}`);
}

export function planByLane(series: PlanSeries, clock: PlanClock): SeriesPlan {
  if (series.lane === "gap") return planGapSeries(series, clock);
  if (series.lane === "stock24" || series.lane === "crypto24") return planTokenSeries(series, clock);
  return planSeries(series, clock);
}
