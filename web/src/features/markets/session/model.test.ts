import { sessionStateWord } from "@cwf/core/copy";
import { describe, expect, it } from "vitest";
import { laneHaltAsset, laneState, parseSessionBody, toMarketSession } from "./model";

// Ops `GET /session` on testnet, Saturday 2026-10-10 15:41Z (trimmed to the fields and lanes the tests read).
const SAT = 1_791_649_306;
const live = {
  nowSec: SAT,
  status: { state: "closed", date: "2026-10-10", session: null, earlyClose: false, halted: false, nextOpenSec: 1_791_811_800, closesAtSec: null },
  label: "Opens Mon 09:30 ET",
  calendar: {
    fromDate: "2026-10-03",
    toDate: "2026-10-24",
    unknownDates: [],
    upcoming: [
      { date: "2026-10-12", openSec: 1_791_811_800, closeSec: 1_791_835_200, earlyClose: false },
      { date: "2026-10-13", openSec: 1_791_898_200, closeSec: 1_791_921_600, earlyClose: false },
    ],
    recent: [{ date: "2026-10-09", openSec: 1_791_552_600, closeSec: 1_791_576_000, earlyClose: false }],
  },
  disagreements: [],
  lanes: { "TSLA-5m": "closed: no session", "TSLA-24-5m": "waiting: next 16:05–16:10Z", "PLTR-24-5m": "paused: no signed source (no RedStone 24/7 feed)", "TSLA-gap": "waiting: lists 10-14 20:00Z for 10-16 20:00Z–10-19 13:30Z" },
  halts: {},
  earnings: [{ symbol: "TSLA", dateEt: "2026-10-20", hour: "amc" }],
  skips: [],
};
const body = parseSessionBody(live)!;
const MON_PRE = 1_791_806_400; // Mon 10-12 08:00 ET
const MON_OPEN = 1_791_817_200; // Mon 10-12 11:00 ET

describe("the /session body", () => {
  it("reads the weekend: closed, the word Weekend, the Monday open", () => {
    const s = toMarketSession(body, SAT)!;
    expect(s.status.state).toBe("closed");
    expect(sessionStateWord(s.status)).toBe("Weekend");
    expect(s.label).toBe("Opens Mon 09:30 ET");
    expect(s.open).toBe(false);
    expect(s.earnings).toEqual([{ symbol: "TSLA", dateEt: "2026-10-20", hour: "amc" }]);
  });

  it("turns over at the boundary without a new event: pre-market Monday, then open", () => {
    expect(toMarketSession(body, MON_PRE)!.status.state).toBe("pre");
    const open = toMarketSession(body, MON_OPEN)!;
    expect(open.status.state).toBe("regular");
    expect(open.label).toBe("Closes 16:00 ET");
  });

  it("names a halt by its reason in hours, and keeps a 24/7 lane's halt at the weekend", () => {
    const exchange = parseSessionBody({ ...live, halts: { TSLA: { reason: "exchange-halt", sinceSec: MON_OPEN - 60 } } })!;
    expect(toMarketSession(exchange, MON_OPEN, "TSLA")).toMatchObject({ label: "Trading halted", status: { state: "halted" } });
    const stale = parseSessionBody({ ...live, halts: { TSLA: { reason: "redstone-stale", sinceSec: MON_OPEN - 60 } } })!;
    expect(toMarketSession(stale, MON_OPEN, "TSLA")!.label).toBe("Signed price stale");
    expect(toMarketSession(stale, MON_OPEN, "NVDA")!.halt).toBeNull();
    const weekend = parseSessionBody({ ...live, halts: { "TSLA-24": { reason: "redstone-stale", sinceSec: SAT - 30 } } })!;
    const s = toMarketSession(weekend, SAT, laneHaltAsset("TSLA", "stock24"))!;
    expect(s.status.state).toBe("closed");
    expect(s.halt).toEqual({ reason: "redstone-stale", sinceSec: SAT - 30 });
  });

  it("finds each lane's roller state by core's lane key", () => {
    expect(laneState(body, "TSLA", "regular", 300)).toBe("closed: no session");
    expect(laneState(body, "PLTR", "stock24", 300)).toMatch(/^paused: no signed source/);
    expect(laneState(body, "TSLA", "gap", 604_800)).toMatch(/^waiting: lists/);
    expect(laneState(body, "NVDA", "regular", 300)).toBeNull();
  });

  it("drops what it can't vouch for, and says nothing without a calendar", () => {
    const odd = parseSessionBody({ ...live, halts: { TSLA: { reason: "pyth-wide", sinceSec: 1 } }, earnings: "?", skips: [{ symbol: "TSLA" }] })!;
    expect(odd.halts).toEqual({});
    expect(odd.earnings).toBeNull();
    expect(odd.skips).toEqual([]);
    expect(toMarketSession(parseSessionBody({ ...live, calendar: null })!, SAT)).toBeNull();
    expect(parseSessionBody({ status: null })).toBeNull();
  });
});
