/**
 * The launch projections over real chain data (index/0010; R6 money S02 + S08): every launchpad log on Moderato to a
 * block, written through the indexer's writer, must agree with the chain at that block — each token's balances sum to
 * its supply and its top holder's matches `balanceOf` — and a replayed window inserts nothing and changes nothing.
 * Needs a Postgres (`TEST_DATABASE_URL`); each run uses a fresh schema and drops it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import { indexWriter, readLaunchBoard, readLaunchFeed, type IdxEvent } from "./index";

const url = process.env.TEST_DATABASE_URL;
type Fixture = { toBlock: number; events: IdxEvent[]; chain: Record<string, { stage: string; totalSupply: string; topHolder: string; topBalance: string }> };
const fx = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "moderato-launch.json"), "utf8")) as Fixture;
const events = fx.events.map((e) => ({ ...e, address: e.address.toLowerCase(), market: null }));
const SPECIAL = { curve: "0x77440b9970e470665a16beae610ffdb9bbcc6c76", pool: "0x33620f62c5b9b2086dd6b62f4a297a9f30347029", locker: "0xf60f444952ae9573827ef6ace9601f18784206aa", cursors: [] };
const TEAM = ["0x64b70cdd6dc30c3ff3eb79493ba17487a1071c96"];

describe.skipIf(!url)("launch index projections (real Moderato logs)", () => {
  const schema = `t_${Date.now().toString(36)}_l`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  const snapshot = async () => ({
    launches: await sql`select token, stage, last_price_e18::text, quote_reserve::text, coin_sold::text, pool_id from idx_launches order by token`,
    trades: await sql`select tx_hash, log_index, venue, quote_base::text, coin_raw::text from idx_launch_trades order by tx_hash, log_index`,
    balances: await sql`select token, holder, balance_raw::text from idx_launch_balances order by token, holder`,
  });
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
    await indexWriter(sql).writeWindow(events, { chainId: 42431, address: SPECIAL.curve, block: fx.toBlock });
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  });

  it("balances match the chain: they sum to the supply and the top holder's is its balanceOf", async () => {
    for (const [token, chain] of Object.entries(fx.chain)) {
      const [sum] = await sql<{ s: string }[]>`select coalesce(sum(balance_raw), 0)::text as s from idx_launch_balances where token = ${token}`;
      expect(sum?.s).toBe(chain.totalSupply);
      const feed = await readLaunchFeed(sql, token, SPECIAL);
      expect(feed.launch?.stage).toBe(chain.stage);
      expect(feed.holders.top[0]).toMatchObject({ holder: chain.topHolder, balanceRaw: chain.topBalance });
    }
  });

  it("a graduated coin keeps trading in its pool: its trades carry both venues, its pool id is set", async () => {
    const feed = await readLaunchFeed(sql, "0x20c00000000000000000000044f3487d7d5d8143", SPECIAL);
    expect(new Set(feed.trades.map((t) => t.venue))).toEqual(new Set(["curve", "pool"]));
    expect(feed.launch?.poolId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(feed.holders.top[0]?.label).toBe("pool");
  });

  it("replaying the window inserts nothing and changes nothing", async () => {
    const before = await snapshot();
    const again = await indexWriter(sql).writeWindow(events, { chainId: 42431, address: SPECIAL.curve, block: fx.toBlock });
    expect(again.inserted).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("the board hides the team's launches unless asked, and counts them", async () => {
    const hidden = await readLaunchBoard(sql, { team: TEAM, includeTeam: false, nowSec: 1_791_925_000 }, SPECIAL);
    const shown = await readLaunchBoard(sql, { team: TEAM, includeTeam: true, nowSec: 1_791_925_000 }, SPECIAL);
    expect(hidden.teamCount).toBe(2);
    expect(hidden.rows).toHaveLength(0);
    expect(shown.rows.every((r) => r.team)).toBe(true);
    expect(shown.rows.find((r) => r.stage === "graduated")?.progressBps).toBe(10_000);
  });
});
