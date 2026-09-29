/** @cwf/db — one Postgres client per process; migrations run in order from `migrations/<area>/`. */
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createSql(url = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 5, prepare: false });
}

export { runMigrations } from "./migrations";
export { insertMppReceipt, receiptsForDecision, type MppReceiptInsert, type MppReceiptRecord } from "./mpp";
