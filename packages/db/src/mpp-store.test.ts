/**
 * mppx's replay store on a real Postgres (migrations/mpp/0002): a value round-trips as JSON, and `update` is atomic —
 * of many concurrent claims on one key exactly one wins, which is what stops a charge credential being spent twice.
 * Needs `TEST_DATABASE_URL`; each run uses a fresh schema and drops it.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { createPgMppStore } from "./mpp-store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("mppx store (replay protection)", () => {
  const schema = `t_${Date.now().toString(36)}_m`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 8, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  });

  it("gets back what it put, and nothing once deleted", async () => {
    const store = createPgMppStore(sql);
    await store.put("mppx:charge:0x01", { expires: 1_760_000_000_000, type: "mppx:replay" });
    expect(await store.get("mppx:charge:0x01")).toEqual({ expires: 1_760_000_000_000, type: "mppx:replay" });
    await store.put("mppx:charge:0x01", 3);
    expect(await store.get("mppx:charge:0x01")).toBe(3);
    await store.delete("mppx:charge:0x01");
    expect(await store.get("mppx:charge:0x01")).toBeNull();
  });

  it("lets exactly one of many concurrent claims on a key win", async () => {
    const store = createPgMppStore(sql);
    const claim = () => store.update("mppx:charge:0x02", (current) => (current === null ? { op: "set", value: { type: "mppx:replay", expires: 1 }, result: true } : { op: "noop", result: false }));
    const results = await Promise.all(Array.from({ length: 8 }, claim));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.get("mppx:charge:0x02")).toEqual({ type: "mppx:replay", expires: 1 });
  });
});
