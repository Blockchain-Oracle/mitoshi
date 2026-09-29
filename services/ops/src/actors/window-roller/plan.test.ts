// Adapted from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/window-roller/{plan,plan-gap,plan-token}.test.ts
import { sessionAt, type SessionCalendar } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { planSeries, type PlanClock, type PlanSeries } from "./plan";
import { planByLane, planGapSeries, planTokenSeries } from "./plan-lanes";
import { ADMIT_UNTIL_LOCK, type VersionWindow } from "./versions";

// Fri 2026-09-25, Mon 09-28, Tue 09-29, Wed 09-30 (EDT: 09:30 ET = 13:30Z, 16:00 ET = 20:00Z).
const FRI = sessionAt("2026-09-25", 570, 960);
const MON = sessionAt("2026-09-28", 570, 960);
const TUE = sessionAt("2026-09-29", 570, 960);
const WED = sessionAt("2026-09-30", 570, 960);
const CALENDAR: SessionCalendar = { fromDate: "2026-09-21", toDate: "2026-10-09", sessions: [FRI, MON, TUE, WED], unknownDates: [] };
const REDSTONE: VersionWindow[] = [{ validFromSec: 0, validUntilSec: null, primarySource: 2, checkSource: 0, openAdmissionSec: 900, checkAdmissionSec: 0 }];
const GAP: VersionWindow[] = [{ ...REDSTONE[0]!, openAdmissionSec: ADMIT_UNTIL_LOCK }];

const series = (over: Partial<PlanSeries> = {}): PlanSeries => ({ key: "TSLA-5m", symbol: "TSLA", lane: "regular", cadenceSec: 300, maxLeadSec: 400_000, nextIndex: 7n, lastExpirySec: 0, versions: REDSTONE, ...over });
const clock = (nowSec: number, over: Partial<PlanClock> = {}): PlanClock => ({ calendar: CALENDAR, nowSec, leadSec: 120, gapLeadSec: 172_800, minTradableSec: 60, skips: [], multipliers: [], halts: {}, prelist: true, prelistCadencesSec: [300, 900, 3_600], ...over });

describe("Regular lane", () => {
  it("opens the session's first Window within the lead as SessionOpen", () => {
    const plan = planSeries(series(), clock(FRI.openSec - 100));
    expect(plan).toMatchObject({ kind: "open", index: 7n, policyVersion: 0, openKind: 1, closeKind: 0 });
    expect(plan.kind === "open" && plan.window.tradingStartSec).toBe(FRI.openSec);
  });

  it("opens back to back and skips a Window whose open print could no longer be recorded", () => {
    const last = FRI.openSec + 300;
    expect((p => p.kind === "open" && p.window.tradingStartSec)(planSeries(series({ lastExpirySec: last }), clock(last - 100)))).toBe(last);
    // At T + 870 the open admission (900 s) minus the 45 s print margin has passed: the next Window is the candidate.
    const late = planSeries(series({ lastExpirySec: last }), clock(last + 870));
    expect(late.kind !== "closed" && late.window.tradingStartSec).toBe(last + 900);
  });

  it("aligns 60m to the ET clock and closes the last one as SessionClose", () => {
    const first = planSeries(series({ cadenceSec: 3_600 }), clock(FRI.openSec));
    expect(first.kind === "wait" && first.window.tradingStartSec).toBe(FRI.openSec + 1_800);
    expect(planSeries(series({ cadenceSec: 3_600, lastExpirySec: FRI.closeSec - 3_600 }), clock(FRI.closeSec - 3_700))).toMatchObject({ kind: "open", closeKind: 2 });
  });

  it("prelists Monday's first Window after Friday's close; without prelist it waits", () => {
    const sat = FRI.closeSec + 86_400;
    expect(planSeries(series({ lastExpirySec: FRI.closeSec }), clock(sat))).toMatchObject({ kind: "open", openKind: 1 });
    expect(planSeries(series({ lastExpirySec: FRI.closeSec }), clock(sat, { prelist: false }))).toMatchObject({ kind: "wait", wakeSec: MON.openSec - 120 });
  });

  it("pauses on a halt, a corporate skip, or no covering version, and lists nothing without a calendar", () => {
    expect(planSeries(series(), clock(FRI.openSec - 60, { halts: { TSLA: { reason: "redstone-stale", sinceSec: 1 } } }))).toMatchObject({ kind: "paused", state: "paused: halted (redstone-stale)" });
    expect(planSeries(series(), clock(FRI.openSec - 60, { skips: [{ symbol: "TSLA", date: "2026-09-25", why: "split" }] }))).toMatchObject({ kind: "paused", state: "paused: corporate action (split)" });
    expect(planSeries(series({ versions: [{ ...REDSTONE[0]!, validFromSec: WED.openSec }] }), clock(FRI.openSec - 60))).toMatchObject({ kind: "paused", state: "paused: no signed source" });
    expect(planSeries(series(), clock(FRI.openSec - 60, { calendar: null }))).toEqual({ kind: "closed", wakeSec: null, state: "closed: no calendar" });
  });
});

describe("Gap lane", () => {
  const gap = series({ key: "TSLA-gap", lane: "gap", cadenceSec: 604_800, versions: GAP });
  it("lists Friday close → Monday open from Wednesday 16:00 ET, locking Sunday 20:00 ET", () => {
    const wed = FRI.closeSec - 2 * 86_400;
    expect(planGapSeries(gap, clock(wed - 60))).toMatchObject({ kind: "wait", wakeSec: wed });
    const plan = planGapSeries(gap, clock(wed + 1));
    expect(plan).toMatchObject({ kind: "open", openKind: 2, closeKind: 1 });
    if (plan.kind === "open") expect([plan.window.tradingStartSec, plan.window.lockAtSec, plan.window.expirySec]).toEqual([FRI.closeSec, Date.parse("2026-09-28T00:00:00Z") / 1000, MON.openSec]);
  });
  it("still lists after Friday's close: the open print is admissible until the lock", () => {
    expect(planGapSeries(gap, clock(FRI.closeSec + 3_600))).toMatchObject({ kind: "open" });
  });
});

describe("24/7 lanes", () => {
  const btc = series({ key: "BTC-5m", symbol: "BTC", lane: "crypto24", lastExpirySec: 1_800_000_000 });
  it("run with no calendar, back to back, and skip ahead after downtime", () => {
    expect(planTokenSeries(btc, clock(1_800_000_000 - 100, { calendar: null }))).toMatchObject({ kind: "open" });
    const after = planTokenSeries(btc, clock(1_800_000_000 + 3_000, { calendar: null }));
    expect(after.kind !== "closed" && after.window.tradingStartSec).toBe(1_800_003_000);
  });
  it("halt a stock's 24/7 lane on its own key (<T>-24), not the session ticker's", () => {
    const tsla24 = series({ key: "TSLA-24-5m", lane: "stock24", lastExpirySec: 1_800_000_000 });
    expect(planByLane(tsla24, clock(1_800_000_000 - 100, { halts: { TSLA: { reason: "exchange-halt", sinceSec: 1 } } }))).toMatchObject({ kind: "open" });
    expect(planByLane(tsla24, clock(1_800_000_000 - 100, { halts: { "TSLA-24": { reason: "redstone-stale", sinceSec: 1 } } }))).toMatchObject({ kind: "paused" });
  });
});
