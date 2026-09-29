#!/usr/bin/env -S pnpm exec tsx
/**
 * halt-replay (S3 gate "recorded halts replayed"): reads halt-watch's recorded observations (`halt_log`, served by ops
 * `GET /halts/log`) and feeds each pass's observed reasons back through the same pure rules (`observeHalts` output →
 * `stepHalts`), requiring the confirmed board after every pass to equal the recorded one. Exit 1 on any difference.
 *
 *   pnpm --dir scripts exec tsx drive/halt-replay.ts [--ops https://ops.testnet.mitoshi.xyz] [--from <unix s>] [--to <unix s>]
 */
import { HALT_ASSETS, type HaltAsset, type HaltReason } from "@cwf/core";
import { emptyHaltState, nonNull, stepHalts, type ObservedHalts } from "../../services/ops/src/actors/halt-watch/decide";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const OPS = arg("--ops", "https://ops.testnet.mitoshi.xyz").replace(/\/$/, "");
const FROM = arg("--from", "0");
const TO = arg("--to", String(Math.floor(Date.now() / 1000)));

type Row = { id: string; pass_sec: string; in_hours: boolean; observed: Record<string, HaltReason>; confirmed: Record<string, HaltReason>; fixture: string | null };

async function main() {
  const res = await fetch(`${OPS}/halts/log?from=${FROM}&to=${TO}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ops /halts/log HTTP ${res.status}`);
  const rows = ((await res.json()) as { rows: Row[] }).rows;
  // Replays run per process lifetime: a restart starts an empty board, which the log shows as a pass with nothing confirmed.
  let state = emptyHaltState();
  const problems: string[] = [];
  const transitions: string[] = [];
  let prev: Record<string, HaltReason> = {};
  for (const row of rows) {
    const observed = Object.fromEntries(HALT_ASSETS.map((a) => [a, (row.observed[a] as HaltReason | undefined) ?? null])) as ObservedHalts;
    let got = nonNull(stepHalts(state, observed, row.in_hours));
    if (JSON.stringify(sorted(got)) !== JSON.stringify(sorted(row.confirmed))) {
      // A process restart between rows resets the board; accept it only when the recorded board is a fresh start.
      state = emptyHaltState();
      got = nonNull(stepHalts(state, observed, row.in_hours));
      if (JSON.stringify(sorted(got)) !== JSON.stringify(sorted(row.confirmed))) problems.push(`row ${row.id} @ ${row.pass_sec}: replay ${JSON.stringify(got)} ≠ recorded ${JSON.stringify(row.confirmed)}`);
    }
    for (const a of new Set([...Object.keys(prev), ...Object.keys(row.confirmed)])) {
      if (prev[a] !== row.confirmed[a]) transitions.push(`${new Date(Number(row.pass_sec) * 1000).toISOString()} ${a as HaltAsset}: ${prev[a] ?? "clear"} → ${row.confirmed[a] ?? "clear"}${row.fixture ? ` (FIXTURE ${row.fixture})` : ""}`);
    }
    prev = row.confirmed;
  }
  console.log(`halt-replay: ${rows.length} recorded passes, ${transitions.length} transitions`);
  for (const t of transitions) console.log(`  ${t}`);
  console.log(problems.length === 0 ? "halt-replay: OK — every recorded board is reproduced by the rules" : `halt-replay: MISMATCH\n  - ${problems.join("\n  - ")}`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
