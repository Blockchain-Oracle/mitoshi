import "server-only";
/** One pooled Postgres client per server process (Coolify Postgres, D-061). */
import { createSql, type Sql } from "@cwf/db";
import { MissingConfigError, serverEnv } from "./env";

let sql: Sql | null = null;

export function db(): Sql {
  if (sql) return sql;
  const url = serverEnv().databaseUrl;
  if (!url) throw new MissingConfigError("DATABASE_URL");
  sql = createSql(url);
  return sql;
}
