/**
 * mppx's key-value store over Postgres (`mpp_store`, migrations/mpp/0002), the shape `Store.from` takes in mppx 0.10
 * (`get` / `put` / `delete` / an atomic `update`). `update` holds a transaction-scoped advisory lock on the key while
 * it reads, runs mppx's pure `fn` and writes, so two requests presenting the same credential can't both claim it.
 */
import type { Sql } from "./index";

type Change<V, R> = { op: "noop"; result: R } | { op: "set"; value: V; result: R } | { op: "delete"; result: R };

export function createPgMppStore(sql: Sql) {
  return {
    async get(key: string): Promise<unknown> {
      const [row] = await sql<{ value: unknown }[]>`select value from mpp_store where key = ${key}`;
      return row ? row.value : null;
    },
    async put(key: string, value: unknown): Promise<void> {
      await sql`insert into mpp_store (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
    },
    async delete(key: string): Promise<void> {
      await sql`delete from mpp_store where key = ${key}`;
    },
    async update<R>(key: string, fn: (current: unknown) => Change<unknown, R>): Promise<R> {
      return sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        const [row] = await tx<{ value: unknown }[]>`select value from mpp_store where key = ${key}`;
        const change = fn(row ? row.value : null);
        if (change.op === "set") await tx`insert into mpp_store (key, value) values (${key}, ${tx.json(change.value as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
        else if (change.op === "delete") await tx`delete from mpp_store where key = ${key}`;
        return change.result;
      }) as Promise<R>;
    },
  };
}

export type PgMppStore = ReturnType<typeof createPgMppStore>;
