/** CLI: `pnpm db:migrate` — applies pending migrations to DATABASE_URL. */
import { createSql } from "./index";
import { runMigrations } from "./migrations";

const sql = createSql();
try {
  const applied = await runMigrations(sql);
  console.log(applied.length ? applied.map((id) => `applied ${id}`).join("\n") : "migrations: up to date");
} finally {
  await sql.end();
}
