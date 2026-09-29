/** Applies `packages/db/migrations/<area>/NNNN_*.sql` in order under an advisory lock (plan C.4.7). Safe to run from
 *  every process at start: the lock serialises them and applied files are skipped. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "./index";

/** Resolved on use, not at import: bundlers (the web app) evaluate this module without a file path. */
const migrationsRoot = () => join(import.meta.dirname, "..", "migrations");
const LOCK_ID = 4217_42431;

async function listMigrations(): Promise<string[]> {
  const areas = await readdir(migrationsRoot(), { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const area of areas.filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    for (const file of (await readdir(join(migrationsRoot(), area))).filter((f) => f.endsWith(".sql")).sort()) files.push(`${area}/${file}`);
  }
  return files;
}

/** Returns the ids applied by this call. */
export async function runMigrations(sql: Sql): Promise<string[]> {
  const applied: string[] = [];
  await sql`select pg_advisory_lock(${LOCK_ID})`;
  try {
    await sql`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await sql<{ id: string }[]>`select id from schema_migrations`).map((r) => r.id));
    for (const id of await listMigrations()) {
      if (done.has(id)) continue;
      const body = await readFile(join(migrationsRoot(), id), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (id) values (${id})`;
      });
      applied.push(id);
    }
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_ID})`.catch(() => undefined);
  }
  return applied;
}
