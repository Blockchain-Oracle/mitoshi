#!/usr/bin/env -S pnpm exec tsx
/**
 * halt-replay (S3 gate "recorded halts replayed"): reads halt-watch's recorded observations (`halt_log`, served by ops
 * `GET /halts/log`), takes them in id order and feeds each pass's observed reasons back through the same pure rules
 * (`stepHalts`), requiring the confirmed board after every pass to equal the recorded one. Exit 1 on any difference.
 * It checks the rules against what halt-watch observed, not RedStone itself: see `replayHaltLog` (D-186).
 *
 *   pnpm --dir scripts exec tsx drive/halt-replay.ts [--ops https://ops.mitoshi.xyz] [--from <unix s>] [--to <unix s>]
 */
import { replayHaltLog, type HaltLogRow } from "../../services/ops/src/actors/halt-watch/replay";

const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback);
const OPS = arg("--ops", "https://ops.mitoshi.xyz").replace(/\/$/, "");
const FROM = arg("--from", "0");
const TO = arg("--to", String(Math.floor(Date.now() / 1000)));

async function main() {
  const res = await fetch(`${OPS}/halts/log?from=${FROM}&to=${TO}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ops /halts/log HTTP ${res.status}`);
  const r = replayHaltLog(((await res.json()) as { rows: HaltLogRow[] }).rows);
  console.log(`halt-replay: ${r.passes} recorded passes (${r.unreadPasses} could not read RedStone: board held), ${r.transitions.length} transitions`);
  for (const t of r.transitions) console.log(`  ${t}`);
  console.log(r.problems.length === 0 ? "halt-replay: OK — every recorded board is reproduced by the rules" : `halt-replay: MISMATCH\n  - ${r.problems.join("\n  - ")}`);
  process.exitCode = r.problems.length === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
