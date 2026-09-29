/** One Postgres client per web server process (Coolify Postgres, D-061), created on first use. Server-only. */
import { createSql, type Sql } from "@cwf/db";

let sql: Sql | null = null;

/** The shared client, or null when DATABASE_URL is not configured (routes answer 503 then). */
export function webSql(): Sql | null {
  if (sql) return sql;
  if (!process.env.DATABASE_URL) return null;
  sql = createSql();
  return sql;
}
