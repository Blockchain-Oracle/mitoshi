/**
 * D-185: a 24/7 stock lane on RedStone never lists a Window that opens or closes on RedStone's 04:00 ET `---24_7` gap
 * (08:00Z under EDT, 09:00Z under EST); the next Window lists when the first skipped one would have. Vectors on a
 * normal EDT day, the 2026-11-01 fall-back and the EST day after, plus whole-day roller simulations.
 */
import { etMinutesOf, isRedStone24x7Gap, type ScheduledWindow } from "@cwf/core";
import { describe, expect, it } from "vitest";
import type { PlanClock, PlanSeries, SeriesPlan } from "./plan";
import { planByLane } from "./plan-lanes";
import type { VersionWindow } from "./versions";

const utc = (iso: string) => Date.parse(iso) / 1000;
const REDSTONE: VersionWindow[] = [{ validFromSec: 0, validUntilSec: null, primarySource: 2, checkSource: 0, openAdmissionSec: 900, checkAdmissionSec: 0 }];
const STREAMS: VersionWindow[] = [{ ...REDSTONE[0]!, primarySource: 5 }];
const lane = (over: Partial<PlanSeries>): PlanSeries => ({ key: "TSLA-24-5m", symbol: "TSLA", lane: "stock24", cadenceSec: 300, maxLeadSec: 400_000, nextIndex: 1n, lastExpirySec: 0, versions: REDSTONE, ...over });
const clock = (nowSec: number): PlanClock => ({ calendar: null, nowSec, leadSec: 120, gapLeadSec: 172_800, minTradableSec: 60, prelist: true, prelistCadencesSec: [300, 900, 3_600], skips: [], multipliers: [], halts: {} });
const startOf = (p: SeriesPlan) => (p.kind === "closed" ? null : p.window.tradingStartSec);

describe("24/7 stock lane around 04:00 ET on an EDT day (Wed 2026-09-30, gap = 08:00Z)", () => {
  it("5m: 03:55–04:00 and 04:00–04:05 ET are never listed; 04:05 lists when 03:55 would have (03:53 ET)", () => {
    expect(startOf(planByLane(lane({ lastExpirySec: utc("2026-09-30T07:50:00Z") }), clock(utc("2026-09-30T07:48:00Z"))))).toBe(utc("2026-09-30T07:50:00Z"));
    const early = planByLane(lane({ lastExpirySec: utc("2026-09-30T07:55:00Z") }), clock(utc("2026-09-30T07:52:59Z")));
    expect(early).toMatchObject({ kind: "wait", wakeSec: utc("2026-09-30T07:53:00Z"), state: "waiting: next 08:05–08:10Z after RedStone's 04:00 ET gap" });
    const due = planByLane(lane({ lastExpirySec: utc("2026-09-30T07:55:00Z") }), clock(utc("2026-09-30T07:53:00Z")));
    expect(due).toMatchObject({ kind: "open", state: "prelisting 08:05–08:10Z after RedStone's 04:00 ET gap #1 v1 redstone" });
    expect(startOf(due)).toBe(utc("2026-09-30T08:05:00Z"));
  });

  it("15m and 60m skip their two Windows too (60m: 03:00–05:00 ET), listing the next at the usual lead of the first skipped", () => {
    const q = planByLane(lane({ cadenceSec: 900, lastExpirySec: utc("2026-09-30T07:45:00Z") }), clock(utc("2026-09-30T07:43:00Z")));
    expect(q).toMatchObject({ kind: "open" });
    expect(startOf(q)).toBe(utc("2026-09-30T08:15:00Z"));
    const h = planByLane(lane({ cadenceSec: 3_600, lastExpirySec: utc("2026-09-30T07:00:00Z") }), clock(utc("2026-09-30T06:58:00Z")));
    expect(h).toMatchObject({ kind: "open" });
    expect(startOf(h)).toBe(utc("2026-09-30T09:00:00Z"));
    expect(planByLane(lane({ cadenceSec: 3_600, lastExpirySec: utc("2026-09-30T07:00:00Z") }), clock(utc("2026-09-30T06:57:59Z")))).toMatchObject({ kind: "wait", wakeSec: utc("2026-09-30T06:58:00Z") });
  });

  it("after a restart inside the gap the next listable Window is the first after it", () => {
    const p = planByLane(lane({ lastExpirySec: utc("2026-09-30T07:30:00Z") }), clock(utc("2026-09-30T08:01:00Z")));
    expect(p).toMatchObject({ kind: "open" });
    expect(startOf(p)).toBe(utc("2026-09-30T08:05:00Z"));
  });

  it("crypto, a Data Streams 24/7 version, and 08:00Z on an EST day are unaffected", () => {
    const btc = lane({ key: "BTC-5m", symbol: "BTC", lane: "crypto24", lastExpirySec: utc("2026-09-30T07:55:00Z") });
    expect(startOf(planByLane(btc, clock(utc("2026-09-30T07:53:00Z"))))).toBe(utc("2026-09-30T07:55:00Z"));
    expect(startOf(planByLane(lane({ versions: STREAMS, lastExpirySec: utc("2026-09-30T07:55:00Z") }), clock(utc("2026-09-30T07:53:00Z"))))).toBe(utc("2026-09-30T07:55:00Z"));
    expect(startOf(planByLane(lane({ lastExpirySec: utc("2026-11-02T07:55:00Z") }), clock(utc("2026-11-02T07:53:00Z"))))).toBe(utc("2026-11-02T07:55:00Z"));
  });
});

describe("across the EDT → EST change (gap = 09:00Z from Sun 2026-11-01)", () => {
  it("the switch Sunday and the Monday after skip 04:00 EST = 09:00Z", () => {
    for (const day of ["2026-11-01", "2026-11-02"]) {
      const p = planByLane(lane({ lastExpirySec: utc(`${day}T08:55:00Z`) }), clock(utc(`${day}T08:53:00Z`)));
      expect(startOf(p)).toBe(utc(`${day}T09:05:00Z`));
      const h = planByLane(lane({ cadenceSec: 3_600, lastExpirySec: utc(`${day}T08:00:00Z`) }), clock(utc(`${day}T07:58:00Z`)));
      expect(startOf(h)).toBe(utc(`${day}T10:00:00Z`));
    }
  });
});

/** Runs the planner the way the roller does (wake, open, re-plan) over [fromIso, toIso) and returns what it lists. */
function simulate(series: PlanSeries, fromIso: string, toIso: string): ScheduledWindow[] {
  const listed: ScheduledWindow[] = [];
  let s = { ...series, lastExpirySec: utc(fromIso) };
  let now = utc(fromIso) - 120;
  while (now < utc(toIso) - s.cadenceSec) {
    const plan = planByLane(s, clock(now));
    if (plan.kind === "open") {
      listed.push(plan.window);
      s = { ...s, nextIndex: s.nextIndex + 1n, lastExpirySec: plan.window.expirySec };
    } else if (plan.kind === "closed") break;
    else now = Math.max(now + 1, plan.wakeSec);
  }
  return listed;
}

describe("whole-day simulations: every other Window is listed, back to back", () => {
  const cases = [
    ["EDT Wed 2026-09-30", "2026-09-30T04:00:00Z", "2026-10-01T04:00:00Z", "2026-09-30T08:00:00Z", 24],
    ["the 25-hour fall-back day", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", "2026-11-01T09:00:00Z", 25],
    ["EST Mon 2026-11-02", "2026-11-02T05:00:00Z", "2026-11-03T05:00:00Z", "2026-11-02T09:00:00Z", 24],
  ] as const;
  for (const [name, from, to, gapIso, hours] of cases) {
    for (const cadenceSec of [300, 900, 3_600]) {
      it(`${name}, ${cadenceSec / 60}m: ${(hours * 3_600) / cadenceSec - 2} Windows, none touching ${gapIso.slice(11, 16)}Z`, () => {
        const listed = simulate(lane({ cadenceSec }), from, to);
        const gap = utc(gapIso);
        expect(listed).toHaveLength((hours * 3_600) / cadenceSec - 2);
        expect(listed.some((w) => w.tradingStartSec === gap || w.expirySec === gap)).toBe(false);
        expect(listed.every((w) => !isRedStone24x7Gap(w.tradingStartSec) && !isRedStone24x7Gap(w.expirySec))).toBe(true);
        for (let i = 1; i < listed.length; i++) {
          const hole = listed[i]!.tradingStartSec - listed[i - 1]!.expirySec;
          // The only hole in the grid is the two skipped Windows around 04:00 ET.
          expect(hole === 0 || (hole === 2 * cadenceSec && listed[i - 1]!.expirySec === gap - cadenceSec)).toBe(true);
        }
        expect(etMinutesOf(listed.find((w) => w.tradingStartSec > gap)!.tradingStartSec)).toBe(4 * 60 + cadenceSec / 60);
      });
    }
  }
});
