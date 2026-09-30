/**
 * halt-replay over the real production log (`GET https://ops.testnet.mitoshi.xyz/halts/log`, fetched 2026-09-30 14:46Z,
 * 84 rows exactly as the route served them: ids sorted as text). The end-of-soak MISMATCH was that order, not the rules.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyHaltState, nonNull, observeHalts, stepHalts, UNREAD, type Observations } from "./decide";
import { replayHaltLog, type HaltLogRow } from "./replay";

const rows = (JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "halts-log-2026-09-30.json"), "utf8")) as { rows: HaltLogRow[] }).rows;

describe("halt-replay on the recorded soak log", () => {
  it("the route's text order (1, 10 … 19, 2, 20 …) is what broke the replay: row 40 followed row 4, 50 followed 5 …", () => {
    expect(rows.slice(0, 3).map((r) => r.id)).toEqual(["1", "10", "11"]);
    // The pre-fix script: rows as served, no numeric sort; `--from 1790665440` (the gate's run) drops rows 1–3.
    const servedMismatches = (from: number) => {
      let state = emptyHaltState();
      const bad: string[] = [];
      const same = (a: object, b: object) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
      for (const row of rows.filter((r) => Number(r.pass_sec) >= from)) {
        const observed = row.observed as never;
        if (same(nonNull(stepHalts(state, observed, row.in_hours)), row.confirmed)) continue;
        state = emptyHaltState();
        if (!same(nonNull(stepHalts(state, observed, row.in_hours)), row.confirmed)) bad.push(row.id);
      }
      return bad;
    };
    expect(servedMismatches(1790665440)).toEqual(["40", "50", "60", "70", "80"]);
    expect(servedMismatches(0)).toEqual(["20", "30", "40", "50", "60", "70", "80"]);
    expect(replayHaltLog(rows).problems).toEqual([]);
    expect(replayHaltLog(rows.filter((r) => Number(r.pass_sec) >= 1790665440)).problems).toEqual([]);
  });

  it("in id order every recorded board is reproduced, and the only transitions are the two all-feeds episodes", () => {
    const r = replayHaltLog(rows);
    expect(r.problems).toEqual([]);
    expect(r.passes).toBe(84);
    const onsets = r.transitions.filter((t) => t.includes("→ redstone-stale"));
    // 19 assets in hours on 09-29 14:45:46Z, 10 always-on assets out of hours on 09-30 10:00:46Z; both cleared ≈ 2–3 min later.
    expect(new Set(onsets.map((t) => t.slice(0, 24)))).toEqual(new Set(["2026-09-29T14:45:46.000Z", "2026-09-30T10:00:46.000Z"]));
    expect(onsets.every((t) => t.endsWith("(every feed stale at once: a failed RedStone fetch, held since D-186)"))).toBe(true);
    expect(onsets).toHaveLength(19 + 10);
  });

  it("the same episode under the fixed rules: the pass observes unread and the board stays clear", () => {
    const row = rows.find((r) => r.id === "13")!;
    const nowSec = Number(row.pass_sec);
    // What halt-watch saw at 14:45:46Z: every followed feed's newest package past 60 s, our last good read older still.
    const aged = { packageSec: nowSec - 65, signers: 5 };
    const primary = Object.fromEntries(Object.keys(row.observed).map((a) => [a, "redstone"])) as Observations["primary"];
    const redstone = Object.fromEntries(Object.keys(row.observed).map((a) => [a, aged])) as Observations["redstone"];
    const o: Observations = { nowSec, inRegularHours: true, primary, redstone, datastreams: {}, exchange: {}, redstoneReadSec: nowSec - 70 };
    const observed = observeHalts(o);
    expect(Object.values(nonNull(observed)).every((v) => v === UNREAD)).toBe(true);
    const st = emptyHaltState();
    for (let i = 0; i < 3; i++) expect(nonNull(stepHalts(st, observed, true))).toEqual({});
    const logged: HaltLogRow = { id: "1", pass_sec: row.pass_sec, in_hours: true, observed: nonNull(observed), confirmed: {}, fixture: null };
    expect(replayHaltLog([logged, { ...logged, id: "2" }])).toMatchObject({ problems: [], unreadPasses: 2, transitions: [] });
  });
});
