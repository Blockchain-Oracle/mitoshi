/**
 * `readTraderCalls` (S9.6, A-3b) over real Moderato logs: the S2 Window's engine fills (the keeper took, the seed maker
 * made) and the S7 vault's executions. A wallet's taken and made fills both count, in raw contracts; a Trading Balance
 * execution counts as the owner's own call unless a STRATEGY grant's runner made it. Needs `TEST_DATABASE_URL`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import { indexWriter, readTraderCalls, type IdxEvent } from "./index";

const url = process.env.TEST_DATABASE_URL;
const load = (name: string) => (JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8")) as { events: IdxEvent[] }).events;
const engine = load("moderato-s2-window.json");
const vault = load("moderato-s7-vault.json").map((e) => ({ ...e, address: e.address.toLowerCase(), market: null }));
const KEEPER = "0x6ed3a4b6e42b2c45211074f8d7ba58dbb2faad0c";
const MAKER = "0x160a25fffa76652ba236ce97395b4d6c51bc3fc0";
const TAPPER = "0x118d23ee";

describe.skipIf(!url)("readTraderCalls (real Moderato logs)", () => {
  const schema = `t_${Date.now().toString(36)}_m`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
    const w = indexWriter(sql);
    const series = [101, 102, 103].map((ticker, i) => ({ series: String(engine.filter((e) => e.name === "SeriesRegistered")[i]!.data.seriesId), ticker, symbol: ["BTC", "ETH", "SOL"][i]!, cadenceSec: 300, basis: 2, lotBase: "1000", tickBase: "1000", cashUnit: "1" }));
    await w.upsertSeries(series);
    await w.writeWindow(engine, { chainId: 42431, address: "0xengine", block: engine.at(-1)!.blockNumber });
    await w.writeWindow(vault, { chainId: 42431, address: vault[0]!.address, block: vault.at(-1)!.blockNumber });
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  });

  it("counts a wallet's taken and made engine fills, in raw contracts", async () => {
    const fill = engine.find((e) => e.name === "Fill")!;
    const markets = [fill.market!];
    const taken = await readTraderCalls(sql, { address: KEEPER, sinceSec: 0, markets });
    const made = await readTraderCalls(sql, { address: MAKER, sinceSec: 0, markets });
    expect(taken.length).toBeGreaterThan(0);
    expect(taken[0]).toMatchObject({ kind: Number(fill.data.takerKind), quantityRaw: (BigInt(String(fill.data.lots)) * 1_000n).toString() });
    expect(made[0]?.kind).toBe(Number(fill.data.makerKind));
  });

  it("counts a session-key tap as the owner's call, and never a STRATEGY grant's runner's", async () => {
    const owner = (vault.find((e) => e.name === "Executed" && String(e.data.owner).toLowerCase().startsWith(TAPPER))!.data.owner as string).toLowerCase();
    const market = (vault.find((e) => e.name === "Executed" && String(e.data.owner).toLowerCase() === owner)!.data.marketId as string).toLowerCase();
    expect(await readTraderCalls(sql, { address: owner, sinceSec: 0, markets: [market] })).toHaveLength(2);
    await sql`update idx_vault_grants set kind = 2 where owner = ${owner}`;
    expect(await readTraderCalls(sql, { address: owner, sinceSec: 0, markets: [market] })).toHaveLength(0);
  });
});
