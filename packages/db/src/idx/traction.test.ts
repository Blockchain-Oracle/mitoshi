/**
 * `/stats`'s read (S5): who a fill counts for. Needs a Postgres (`TEST_DATABASE_URL`); a fresh schema per run, dropped
 * after. Five fills cover every rule: the house against itself (not a call), a wallet taking (its own call), a vault
 * taking (the owner it executed for), the house taking against a wallet's resting order (the maker's mirrored kind and
 * complement price on a mint) and a product contract taking (a call nobody is named for).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import { everyDay, readTraction } from "./traction";

const url = process.env.TEST_DATABASE_URL;
const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const [KEEPER, SEED, VAULT, PRODUCT, U1, U2, U3] = [1, 2, 3, 4, 11, 12, 13].map(a) as [string, string, string, string, string, string, string];
const M = `0x${"ab".repeat(32)}`;
const DAY = 86_400;
const T0 = 20_736 * DAY + 3_600;

describe("everyDay", () => {
  it("fills every UTC day from the first call to today with real zeros", () => {
    expect(everyDay([{ day: 10, n: 2 }], [{ day: 10, n: 5 }, { day: 12, n: 1 }], 13)).toEqual([
      { day: 10, newWallets: 2, calls: 5 },
      { day: 11, newWallets: 0, calls: 0 },
      { day: 12, newWallets: 0, calls: 1 },
      { day: 13, newWallets: 0, calls: 0 },
    ]);
    expect(everyDay(null, null, 13)).toEqual([]);
  });
});

describe.skipIf(!url)("readTraction (fresh schema)", () => {
  const schema = `t_${Date.now().toString(36)}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
    await sql`insert into idx_series (series, ticker, symbol, cadence_sec, basis, lot_base, tick_base, cash_unit) values ('s1', 1, 'BTC', 300, 0, 1000, 1000, 1)`;
    await sql`insert into idx_markets (market, series, symbol, cadence_sec, basis, opened_tx, state) values (${M}, 's1', 'BTC', 300, 0, '0xopen', 'resolved')`;
    const fill = (i: number, taker: string, kind: number, maker: string, path: number, price: number) =>
      sql`insert into idx_fills (chain_id, tx_hash, log_index, market, seq, block_number, ts_sec, taker, taker_kind, maker, maker_kind, maker_order_id, path, price_ticks, lots, maker_remaining)
          values (42431, ${`0xtx${i}`}, 0, ${M}, ${i}, ${i}, ${T0 + i}, ${taker}, ${kind}, ${maker}, 0, 1, ${path}, ${price}, 1000, 0)`;
    await fill(1, KEEPER, 0, SEED, 2, 500);
    await fill(2, U1, 0, SEED, 2, 520);
    await fill(3, VAULT, 2, SEED, 2, 480);
    await fill(4, KEEPER, 0, U3, 2, 600);
    await fill(5, PRODUCT, 1, SEED, 0, 700);
    await sql`insert into idx_vault_executions (tx_hash, log_index, vault, block_number, owner, market, grant_id, outcome_idx, is_buy, cash_delta, token_delta, actor, at_sec)
      values ('0xtx3', 1, ${VAULT}, 3, ${U2}, ${M}, 1, 1, true, 520000, 1000000, ${U2}, ${T0 + 3})`;
    const redeem = (i: number, holder: string, total: number) =>
      sql`insert into idx_redemptions (chain_id, tx_hash, log_index, market, holder, by_address, yes_lots, no_lots, payout_base, credit_base, total_base, is_partial, held_as_credit, ts_sec)
          values (42431, ${`0xrd${i}`}, 0, ${M}, ${holder}, ${holder}, 0, 0, ${total}, 0, ${total}, false, false, ${T0 + 10})`;
    await redeem(1, U1, 1_000_000);
    await redeem(2, SEED, 500_000);
    await redeem(3, VAULT, 300_000);
    await sql`insert into idx_vault_settlements (tx_hash, log_index, vault, block_number, owner, market, payout_base, yes_redeemed, no_redeemed, settled_by, at_sec)
      values ('0xrd3', 1, ${VAULT}, 9, ${U2}, ${M}, 250000, 0, 1000, ${KEEPER}, ${T0 + 10})`;
  }, 180_000);
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  }, 60_000);

  it("counts wallets and calls without the house, attributes vault taps, and names no one for a product", async () => {
    const t = await readTraction(sql, { house: [KEEPER, SEED], vaults: [VAULT], products: [PRODUCT], nowSec: T0 + 60 });
    expect(t).toMatchObject({ wallets: 3, wallets24h: 3, calls: 4, calls24h: 4, unattributed: 1, houseFills: 1, windowsOpened: 1, windowsResolved: 1 });
    // 520¢ + (1000 − 480) + the maker's NO at 1000 − 600 + 700, per 1,000 lots: what each caller paid or received.
    expect(t.tradedBase).toBe(String(520_000 + 520_000 + 400_000 + 700_000));
    // U1's redemption + U2's Trading Balance settlement; the house's and the vault's own redemptions are not wallets'.
    expect(t.paidBase).toBe("1250000");
    expect(t.days).toEqual([{ day: 20_736, newWallets: 3, calls: 4 }]);
    expect(t.recent.map((c) => [c.txHash, c.wallet, c.kind, c.cashBase])).toEqual([
      ["0xtx5", null, 1, "700000"],
      ["0xtx4", U3, 2, "400000"],
      ["0xtx3", U2, 2, "520000"],
      ["0xtx2", U1, 0, "520000"],
    ]);
  });
});
