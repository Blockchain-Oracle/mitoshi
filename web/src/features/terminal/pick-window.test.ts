// Ported in spirit from Owarine ecb7565b:web/src/features/terminal/pick-window.test.ts — over the terminal's state table
// (stage-23 "Window rule"): crypto 5m, Regular in NYSE hours, 24/7 off-hours, the weekend Gap, prelisted Windows.
import type { EventMarket, LaneBasis, LaneSet } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { defaultLane, gap0400NextOpen, lanesFor, pickWindow, windowChips, type TerminalLane } from "./pick-window";

let n = 0;
const w = (asset: string, lane: LaneBasis, intervalSec: number, start: number, extra: Partial<EventMarket> = {}): EventMarket =>
  ({ marketId: `0x${(++n).toString(16).padStart(64, "0")}`, asset, lane, intervalSec, tradingStartSec: start, lockAtSec: start + intervalSec, expirySec: start + intervalSec, state: "open", ...extra }) as unknown as EventMarket;

function laneSet(markets: EventMarket[]): LaneSet {
  const by = new Map<string, { basis: LaneBasis; intervalSec: number; label: string; markets: EventMarket[]; nextStartSec: null }>();
  for (const m of markets) {
    const key = `${m.lane}:${m.intervalSec}`;
    if (!by.has(key)) by.set(key, { basis: m.lane, intervalSec: m.intervalSec, label: key, markets: [], nextStartSec: null });
    by.get(key)!.markets.push(m);
  }
  return { lanes: [...by.values()] } as LaneSet;
}

const T = 1_000_000;

describe("the terminal's Window rule", () => {
  it("shows the Window trading now on a lane, else the soonest prelisted one", () => {
    const now = w("BTC", "crypto24", 300, T - 100);
    const next = w("BTC", "crypto24", 300, T + 200);
    expect(pickWindow([next, now], T)).toBe(now);
    expect(pickWindow([next], T)).toBe(next);
    expect(pickWindow([w("BTC", "crypto24", 300, T - 400, { state: "resolved" } as Partial<EventMarket>)], T)).toBeNull();
  });

  it("stays on a Window inside its last 30 s instead of moving into the next one's resting call", () => {
    const closing = w("ETH", "crypto24", 300, T - 285);
    const next = w("ETH", "crypto24", 300, T + 15);
    expect(pickWindow([closing, next], T)).toBe(closing);
  });

  it("opens crypto on its shortest lane", () => {
    const set = laneSet([w("SOL", "crypto24", 900, T - 10), w("SOL", "crypto24", 300, T - 10), w("SOL", "crypto24", 3600, T - 10)]);
    expect(lanesFor(set, "SOL", T).map((l) => l.label)).toEqual(["5m", "15m", "1h"]);
    expect(defaultLane(set, "SOL", T, null)?.intervalSec).toBe(300);
  });

  it("opens a stock on Regular in NYSE hours, 24/7 off-hours, and the Gap only when nothing shorter lists", () => {
    const rth = laneSet([w("TSLA", "regular", 300, T - 10), w("TSLA", "stock24", 300, T - 10)]);
    expect(defaultLane(rth, "TSLA", T, null)?.basis).toBe("regular");
    expect(defaultLane(rth, "TSLA", T, "stock24:300")?.basis).toBe("stock24");
    const evening = laneSet([w("TSLA", "regular", 300, T + 50_000), w("TSLA", "stock24", 300, T - 10)]);
    expect(defaultLane(evening, "TSLA", T, null)?.basis).toBe("stock24");
    const weekend = laneSet([w("TSLA", "gap", 604_800, T - 100_000, { lockAtSec: T + 50_000 } as Partial<EventMarket>), w("TSLA", "stock24", 300, T - 10)]);
    expect(lanesFor(weekend, "TSLA", T).map((l) => l.basis)).toEqual(["stock24", "gap"]);
    expect(defaultLane(weekend, "TSLA", T, null)?.basis).toBe("stock24");
  });

  it("offers no lane where a symbol lists nothing (SPCX), and ignores an asked lane that is gone", () => {
    const set = laneSet([w("TSLA", "regular", 300, T - 10)]);
    expect(defaultLane(set, "SPCX", T, null)).toBeNull();
    expect(defaultLane(set, "TSLA", T, "stock24:300")?.basis).toBe("regular");
  });
});

describe("RedStone's 04:00 ET gap on a 24/7 stock lane (D-185)", () => {
  // 2026-10-08 is EDT: 04:00 ET is 08:00Z.
  const at = (iso: string) => Date.parse(iso) / 1000;
  it("names the next listed slot for each cadence while the gap's slots are empty", () => {
    expect(gap0400NextOpen("stock24", 300, at("2026-10-08T07:57:00Z"))).toBe(at("2026-10-08T08:05:00Z"));
    expect(gap0400NextOpen("stock24", 300, at("2026-10-08T08:02:00Z"))).toBe(at("2026-10-08T08:05:00Z"));
    expect(gap0400NextOpen("stock24", 900, at("2026-10-08T07:50:00Z"))).toBe(at("2026-10-08T08:15:00Z"));
    expect(gap0400NextOpen("stock24", 3_600, at("2026-10-08T07:10:00Z"))).toBe(at("2026-10-08T09:00:00Z"));
  });
  it("is null outside the gap, on other lanes, and under EST at 08:00Z", () => {
    expect(gap0400NextOpen("stock24", 300, at("2026-10-08T08:06:00Z"))).toBeNull();
    expect(gap0400NextOpen("crypto24", 300, at("2026-10-08T07:57:00Z"))).toBeNull();
    expect(gap0400NextOpen("regular", 300, at("2026-10-08T07:57:00Z"))).toBeNull();
    expect(gap0400NextOpen("stock24", 300, at("2026-12-08T07:57:00Z"))).toBeNull();
    expect(gap0400NextOpen("stock24", 300, at("2026-12-08T08:57:00Z"))).toBe(at("2026-12-08T09:05:00Z"));
  });
});

describe("the Window chip on a stock with both feeds (R4-0)", () => {
  const lane = (basis: LaneBasis, intervalSec: number): TerminalLane => ({ key: `${basis}:${intervalSec}` as TerminalLane["key"], basis, intervalSec, label: `${basis} ${intervalSec}` });
  const stock = [lane("regular", 300), lane("regular", 900), lane("regular", 3_600), lane("stock24", 300), lane("stock24", 900), lane("stock24", 3_600), lane("gap", 604_800)];
  it("shows the basis on screen, cadence only, the Gap, and a 24/7 switch to the same cadence", () => {
    const regular = windowChips(stock, "regular:900");
    expect(regular.shown.map((l) => [l.key, l.label])).toEqual([["regular:300", "5m"], ["regular:900", "15m"], ["regular:3600", "1h"], ["gap:604800", "gap 604800"]]);
    expect(regular.toggle).toEqual({ on: false, to: stock[4] });
    const allDay = windowChips(stock, "stock24:3600");
    expect(allDay.shown.map((l) => l.key)).toEqual(["stock24:300", "stock24:900", "stock24:3600", "gap:604800"]);
    expect(allDay.toggle).toEqual({ on: true, to: stock[2] });
  });
  it("from the Gap or no lane, switches from Regular's first cadence; one basis lists every lane, no switch", () => {
    expect(windowChips(stock, "gap:604800").toggle).toEqual({ on: false, to: stock[3] });
    expect(windowChips(stock, null).toggle).toEqual({ on: false, to: stock[3] });
    const crypto = [lane("crypto24", 300), lane("crypto24", 900)];
    expect(windowChips(crypto, "crypto24:300")).toEqual({ shown: crypto, toggle: null });
    const offHours = [lane("stock24", 300), lane("gap", 604_800)];
    expect(windowChips(offHours, "stock24:300")).toEqual({ shown: offHours, toggle: null });
  });
  it("falls back to the other basis's first lane when the cadence isn't listed there", () => {
    const uneven = [lane("regular", 300), lane("regular", 3_600), lane("stock24", 300)];
    expect(windowChips(uneven, "regular:3600").toggle).toEqual({ on: false, to: uneven[2] });
  });
});
