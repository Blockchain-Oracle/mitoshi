/**
 * The strategy projections over real chain data (index/0006, S9): every StrategyRegistry log on Moderato up to a block
 * (the house strategies and a live copy → fade on the same grant → stop → end) and every ERC-8004 feedback log, written
 * through the indexer's writer, must agree with what the chain says at that block — each strategy (`strategyOf`), each
 * consent (`subscriptionOf`) and each feedback (`readFeedback`) — and a replayed window changes nothing. Needs a
 * Postgres (`TEST_DATABASE_URL`); each run uses a fresh schema and drops it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import { indexWriter, readIndexedStrategies, readSubscribers, readSubscriptionsOf, type IdxEvent } from "./index";

const url = process.env.TEST_DATABASE_URL;
type Fixture = {
  toBlock: string; registry: string; reputation: string; events: IdxEvent[];
  chain: {
    strategies: Record<string, { runner: string; feeBase: string; active: boolean; subscribers: number; revision: number; agentId: string }>;
    subscriptions: Record<string, { grantId: string; mode: number; active: boolean }>;
    feedback: Record<string, { value: string; valueDecimals: number; revoked: boolean }>;
  };
};
const fx = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "moderato-s9-strategies.json"), "utf8")) as Fixture;
const events = fx.events.map((e) => ({ ...e, address: e.address.toLowerCase(), market: null }));

describe.skipIf(!url)("strategy index projections (real Moderato logs)", () => {
  const schema = `t_${Date.now().toString(36)}_s`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
    await indexWriter(sql).writeWindow(events, { chainId: 42431, address: fx.registry, block: Number(fx.toBlock) });
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  });

  const snapshot = async () => ({
    strategies: await sql`select * from idx_strategies order by strategy_id`,
    subscriptions: await sql`select * from idx_subscriptions order by strategy_id, subscriber`,
    feedback: await sql`select * from idx_agent_feedback order by agent_id, client, feedback_index`,
  });

  it("holds every strategy as the chain does, with its metadata read back and matching its hash", async () => {
    const rows = await readIndexedStrategies(sql, { registry: fx.registry });
    expect(rows.map((r) => r.strategyId).sort()).toEqual(Object.keys(fx.chain.strategies).sort());
    for (const r of rows) {
      const c = fx.chain.strategies[r.strategyId]!;
      expect({ runner: r.runner, feeBase: r.feeBase, active: r.active, subscribers: r.subscribers, revision: r.revision, agentId: r.agentId ?? "0" }).toEqual(c);
      expect(r.metadata, `strategy ${r.strategyId} metadata`).not.toBeNull();
      expect(JSON.parse(r.metadata!).name).toMatch(/BTC Momentum|ETH Mean-reversion|House agent/);
      expect(r.series).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("holds every consent as the chain does: the follow and the fade ended, the fade's mode kept", async () => {
    const all = await sql<{ strategy_id: string; subscriber: string; grant_id: string; mode: number; active: boolean }[]>`select strategy_id::text, subscriber, grant_id::text, mode, active from idx_subscriptions`;
    expect(all.length).toBe(Object.keys(fx.chain.subscriptions).length);
    for (const s of all) expect({ grantId: s.grant_id, mode: s.mode, active: s.active }).toEqual(fx.chain.subscriptions[`${s.strategy_id}:${s.subscriber}`]);
    const copier = all[0]!.subscriber;
    const mine = await readSubscriptionsOf(sql, fx.registry, copier);
    expect(mine.map((s) => [s.strategyId, s.mode, s.active])).toEqual(expect.arrayContaining([["1", "follow", false], ["2", "fade", false]]));
    expect(await readSubscribers(sql, fx.registry, "1")).toEqual([]);
  });

  it("holds every ERC-8004 feedback as the chain does", async () => {
    const rows = await sql<{ agent_id: string; client: string; feedback_index: string; value: string; value_decimals: number; revoked: boolean }[]>`
      select agent_id::text, client, feedback_index::text, value::text, value_decimals, revoked from idx_agent_feedback`;
    expect(rows.length).toBe(Object.keys(fx.chain.feedback).length);
    for (const r of rows) expect({ value: r.value, valueDecimals: r.value_decimals, revoked: r.revoked }).toEqual(fx.chain.feedback[`${r.agent_id}:${r.client}:${r.feedback_index}`]);
  });

  it("a replayed window changes nothing", async () => {
    const before = await snapshot();
    const again = await indexWriter(sql).writeWindow(events, { chainId: 42431, address: fx.registry, block: Number(fx.toBlock) });
    expect(again.inserted).toBe(0);
    expect(await snapshot()).toEqual(before);
  });
});
