/**
 * halt-replay's pure core (S3 gate "recorded halts replayed"). What it compares: halt-watch's recorded passes
 * (`halt_log`, served by ops `GET /halts/log`), taken in `id` order (the order they were written), have their observed
 * reasons fed back through the same `stepHalts`, and the confirmed board after every pass must equal the recorded one.
 * It proves the board follows the rules from what halt-watch observed; it does not re-read RedStone, so a pass that
 * observed a false "stale" replays as that stale. Such passes are flagged: before D-186 halt-watch recorded our own
 * failed RedStone fetch as every feed stale at once; since D-186 it observes them `unread` and holds the board.
 */
import { HALT_ASSETS, type HaltAsset } from "@cwf/core";
import { emptyHaltState, nonNull, stepHalts, UNREAD, type Observation, type ObservedHalts } from "./decide";

export interface HaltLogRow {
  id: string;
  pass_sec: string;
  in_hours: boolean;
  observed: Record<string, string>;
  confirmed: Record<string, string>;
  fixture: string | null;
}

export interface HaltReplay {
  passes: number;
  /** Passes that could not read RedStone (D-186): the board held. */
  unreadPasses: number;
  transitions: string[];
  problems: string[];
}

const sorted = (o: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));

/** A pre-D-186 pass on which every observed asset was `redstone-stale`: our fetch failing, recorded as halts. */
export const allStaleAtOnce = (observed: Record<string, string>) => {
  const seen = Object.values(observed);
  return seen.length >= 2 && seen.every((r) => r === "redstone-stale");
};

export function replayHaltLog(rows: readonly HaltLogRow[]): HaltReplay {
  // Ids are bigserial; the route used to sort them as text (1, 10, 11 … 19, 2, 20 …), so order them here as numbers.
  const ordered = [...rows].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
  let state = emptyHaltState();
  const out: HaltReplay = { passes: ordered.length, unreadPasses: 0, transitions: [], problems: [] };
  let prev: Record<string, string> = {};
  for (const row of ordered) {
    const observed = Object.fromEntries(HALT_ASSETS.map((a) => [a, (row.observed[a] as Observation | undefined) ?? null])) as ObservedHalts;
    if (Object.values(observed).includes(UNREAD)) out.unreadPasses++;
    let got = nonNull(stepHalts(state, observed, row.in_hours));
    if (sorted(got) !== sorted(row.confirmed)) {
      // A process restart between rows starts an empty board: accept it only when the recorded board is a fresh start.
      state = emptyHaltState();
      got = nonNull(stepHalts(state, observed, row.in_hours));
      if (sorted(got) !== sorted(row.confirmed)) out.problems.push(`row ${row.id} @ ${row.pass_sec}: replay ${JSON.stringify(got)} ≠ recorded ${JSON.stringify(row.confirmed)}`);
    }
    const note = row.fixture ? ` (FIXTURE ${row.fixture})` : allStaleAtOnce(row.observed) ? " (every feed stale at once: a failed RedStone fetch, held since D-186)" : "";
    for (const a of new Set([...Object.keys(prev), ...Object.keys(row.confirmed)])) {
      if (prev[a] !== row.confirmed[a]) out.transitions.push(`${new Date(Number(row.pass_sec) * 1000).toISOString()} ${a as HaltAsset}: ${prev[a] ?? "clear"} → ${row.confirmed[a] ?? "clear"}${note}`);
    }
    prev = row.confirmed;
  }
  return out;
}
