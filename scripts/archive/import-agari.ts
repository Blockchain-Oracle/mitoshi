/**
 * Imports Agari's laptop RedStone archive (`stocklana/data/archive/redstone/<date>.jsonl`, written by
 * stocklana scripts/archive/redstone.mjs) into `print_archive` (plan S0.11). Idempotent: existing (source, T) rows win.
 *
 *   DATABASE_URL=… tsx scripts/archive/import-agari.ts [dir]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSql } from "@cwf/db";

interface Line { T: number; fetchedAtMs: number; complete: boolean; summary: unknown; feeds: unknown }

const dir = process.argv[2] ?? "/Users/abu/dev/hackathon/stocklana/data/archive/redstone";
const sql = createSql();
let inserted = 0;
let seen = 0;
try {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const raw of readFileSync(join(dir, file), "utf8").split("\n")) {
      if (!raw.trim()) continue;
      const line = JSON.parse(raw) as Line;
      seen++;
      const rows = await sql`insert into print_archive (source, t_sec, fetched_at, complete, summary, feeds, origin)
        values ('redstone', ${line.T}, ${new Date(line.fetchedAtMs)}, ${line.complete}, ${sql.json(JSON.parse(JSON.stringify(line.summary)))}, ${sql.json(JSON.parse(JSON.stringify(line.feeds)))}, 'agari-laptop')
        on conflict (source, t_sec) do nothing returning t_sec`;
      inserted += rows.length;
    }
  }
  const [range] = await sql<{ min: string; max: string; n: string }[]>`select min(t_sec)::text, max(t_sec)::text, count(*)::text as n from print_archive where source = 'redstone'`;
  console.log(`import-agari: read ${seen} boundaries, inserted ${inserted}; archive now ${range?.n} rows, T ${range?.min}…${range?.max}`);
} finally {
  await sql.end();
}
