/**
 * The leaderboard's rounds (S5): one wallet's win, loss, closed and void rounds from positions, a Trading Balance
 * owner's round from vault executions, and the house never ranked. Needs a Postgres (`TEST_DATABASE_URL`); a fresh
 * schema per run, dropped after.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import { readSettledRounds } from "./rounds";

const url = process.env.TEST_DATABASE_URL;
const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const [SEED, VAULT, U1, U2] = [2, 3, 11, 12].map(a) as [string, string, string, string];
const m = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const FULL = 10_000_000;

describe.skipIf(!url)("readSettledRounds (fresh schema)", () => {
  const schema = `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
    await sql`insert into idx_series (series, ticker, symbol, cadence_sec, basis, lot_base, tick_base, cash_unit) values ('s1', 1, 'BTC', 300, 0, 1000, 1000, 1)`;
    // m1 UP won, m2 DOWN won, m3 voided, m4 still open.
    const market = (n: number, state: string, py: number, pn: number) =>
      sql`insert into idx_markets (market, series, symbol, cadence_sec, basis, opened_tx, state, payout_yes, payout_no, expiry_sec, resolved_ts_sec)
          values (${m(n)}, 's1', 'BTC', 300, 0, '0xopen', ${state}, ${py}, ${pn}, ${1000 + n}, ${state === "open" ? null : 2000 + n})`;
    await market(1, "resolved", FULL, 0);
    await market(2, "resolved", 0, FULL);
    await market(3, "voided", FULL / 2, FULL / 2);
    await market(4, "open", 0, 0);
    // U1: m1 bought 1,000 YES lots at 520 (win), m2 bought 2,000 YES at 400 (loss), m3 1,000 YES at 500 (void),
    // m1 again? no: m4 open (not a round). U2 sold everything back before m2 settled (closed). SEED wins m2 (house).
    const pos = (n: number, owner: string, by: number, sy: number, bn: number, paid: number, received: number) =>
      sql`insert into idx_positions (market, owner, bought_yes_lots, sold_yes_lots, bought_no_lots, paid_ticklots, received_ticklots, yes_lots, no_lots)
          values (${m(n)}, ${owner}, ${by}, ${sy}, ${bn}, ${paid}, ${received}, ${by - sy}, ${bn})`;
    await pos(1, U1, 1000, 0, 0, 520_000, 0);
    await pos(2, U1, 2000, 0, 0, 800_000, 0);
    await pos(3, U1, 1000, 0, 0, 500_000, 0);
    await pos(4, U1, 1000, 0, 0, 500_000, 0);
    await pos(2, U2, 1000, 1000, 0, 450_000, 480_000);
    await pos(2, SEED, 0, 0, 3000, 1_800_000, 0);
    // The vault bought 2,066,000 NO tokens on m2 for U2 for $0.97, and sold 66,000 back for $0.04.
    const exec = (i: number, isBuy: boolean, cash: number, tokens: number) =>
      sql`insert into idx_vault_executions (tx_hash, log_index, vault, block_number, owner, market, grant_id, outcome_idx, is_buy, cash_delta, token_delta, actor, at_sec)
          values (${`0xv${i}`}, 0, ${VAULT}, ${i}, ${U2}, ${m(2)}, 1, 1, ${isBuy}, ${cash}, ${tokens}, ${U2}, ${1500 + i})`;
    await exec(1, true, 971_020, 2_066_000);
    await exec(2, false, 40_000, 66_000);
    await pos(2, VAULT, 0, 0, 2066, 971_020, 0);
  }, 180_000);
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  }, 60_000);

  it("prices each round by the settlement rule on what was held, and attributes the vault's to its owner", async () => {
    const rounds = await readSettledRounds(sql, { house: [SEED], vaults: [VAULT], products: [] });
    const view = rounds.map((r) => [r.owner, r.market, r.outcome, r.stakeBase, r.proceedsBase, r.payoutBase]);
    // U2's own closed position and its Trading Balance's winning taps on m2 are one round: summed, a win overall.
    expect(view).toEqual([
      [U1, m(1), "win", 520_000n, 0n, 1_000_000n],
      [U1, m(2), "loss", 800_000n, 0n, 0n],
      [U2, m(2), "win", 1_421_020n, 520_000n, 2_000_000n],
      [U1, m(3), "void", 500_000n, 0n, 500_000n],
    ]);
    expect(await readSettledRounds(sql, { house: [SEED], vaults: [VAULT], products: [], sinceSec: 2003 })).toHaveLength(1);
    // One wallet's profile: its direct and its Trading Balance rounds, nobody else's.
    expect((await readSettledRounds(sql, { house: [SEED], vaults: [VAULT], products: [], owner: U2 })).map((r) => r.outcome)).toEqual(["win"]);
  });
});
