/** Applies `packages/db/migrations/<area>/NNNN_*.sql` in order under an advisory lock (plan C.4.7). */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSql } from "./index";

const ROOT = join(import.meta.dirname, "..", "migrations");
const LOCK_ID = 4217_42431;

async function listMigrations(): Promise<string[]> {
  const areas = await readdir(ROOT, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const area of areas.filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    for (const file of (await readdir(join(ROOT, area))).filter((f) => f.endsWith(".sql")).sort()) files.push(`${area}/${file}`);
  }
  return files;
}

async function main(): Promise<void> {
  const sql = createSql();
  try {
    await sql`select pg_advisory_lock(${LOCK_ID})`;
    await sql`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql<{ id: string }[]>`select id from schema_migrations`).map((r) => r.id));
    for (const id of await listMigrations()) {
      if (applied.has(id)) continue;
      const body = await readFile(join(ROOT, id), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (id) values (${id})`;
      });
      console.log(`applied ${id}`);
    }
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_ID})`.catch(() => undefined);
    await sql.end();
  }
}

await main();
