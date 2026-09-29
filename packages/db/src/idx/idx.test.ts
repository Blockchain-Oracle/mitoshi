/**
 * Projection proofs over real chain data (the S2.12 live Window's 29 logs): idempotent replays, out-of-order windows
 * rebuilt to the same projections, and `seq` holes detected. Needs a Postgres (`TEST_DATABASE_URL`); each run uses a
 * fresh schema and drops it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import { indexReader, indexWriter, type IdxEvent } from "./index";

const url = process.env.TEST_DATABASE_URL;
const events = (JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "moderato-s2-window.json"), "utf8")) as { events: IdxEvent[] }).events;
const ENGINE = events[0]!.address;
const BTC = "0x86abcd4bf94f80f80f37bc3c958ec059b7ebf6a0e9f049f8b71b366c2eb14e3f";

describe.skipIf(!url)("engine index projections (real S2.12 logs)", () => {
  const schema = `t_${Date.now().toString(36)}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create schema ${schema}`);
    sql = postgres(url!, { max: 2, prepare: false, onnotice: () => undefined, connection: { search_path: schema } });
    await runMigrations(sql);
  });
  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema ${schema} cascade`);
    await admin?.end();
  });

  const snapshot = async () => ({
    markets: await sql`select market, state, winner, payout_yes, volume_lots::text, trade_count, backing_lots::text, last_seq from idx_markets order by market`,
    positions: await sql`select market, owner, yes_lots::text, no_lots::text, paid_ticklots::text, received_ticklots::text, minted_lots::text, payout_base::text, held_credit_base::text, withdrawn_base::text, redeemed, redeemed_by_crank, fills from idx_positions order by market, owner`,
    orders: await sql`select tx_hash, status, remaining_lots::text, removed_reason from idx_orders order by tx_hash, log_index`,
    prints: await sql`select market, which, price_e8::text from idx_prints order by market, which`,
    credits: await sql`select * from idx_credits order by market, holder`,
  });
  const series = [101, 102, 103].map((ticker, i) => ({ series: String(events.filter((e) => e.name === "SeriesRegistered")[i]!.data.seriesId), ticker, symbol: ["BTC", "ETH", "SOL"][i]!, cadenceSec: 300, basis: 2, lotBase: "1000", tickBase: "1000", cashUnit: "1" }));

  it("projects the live Window exactly as the chain settled it", async () => {
    const w = indexWriter(sql);
    await w.upsertSeries(series);
    const r = await w.writeWindow(events, { chainId: 42431, address: ENGINE, block: events.at(-1)!.blockNumber });
    expect(r.inserted).toBe(29);
    expect(r.rebuilt).toEqual([]);
    const s = await snapshot();
    const btc = s.markets.find((m) => m.market === BTC)!;
    expect(btc).toMatchObject({ state: "resolved", winner: 0, payout_yes: "10000000", volume_lots: "2000", trade_count: "2", backing_lots: "3000" });
    // Every holder redeemed down to zero lots; the desk's payout was held (P12) and later withdrawn.
    expect(s.positions.filter((p) => p.market === BTC).every((p) => p.yes_lots === "0" && p.no_lots === "0" && p.redeemed)).toBe(true);
    expect(s.credits).toEqual([expect.objectContaining({ market: BTC, held_base: "1000000", withdrawn_base: "1000000" })]);
    expect(s.prints.filter((p) => p.market === BTC).map((p) => p.price_e8)).toEqual(["8316848001837", "8322017000000"]);
    expect((await indexReader(sql).countsThrough(42431, 99_999_999)).markets_with_gaps).toBe(0);
  });

  it("serves every /api/index read from the projections", async () => {
    const r = indexReader(sql);
    const desk = "0x9540cdcd69636229be905225979a7e5baa044cb9";
    const [btc] = await r.markets({ market: BTC });
    expect(btc).toMatchObject({ symbol: "BTC", state: "resolved", cash_unit: "1" });
    expect(Object.keys(btc!.prints as object).sort()).toEqual(["0", "1"]);
    expect(await r.markets({ liveAtSec: 1_790_658_000 })).toHaveLength(2); // ETH and SOL still open (never printed)
    expect((await r.walletFills(desk)).map((f) => f.lots)).toEqual(["1000"]);
    expect((await r.fills({ market: BTC })).length).toBe(2);
    expect((await r.positions(desk))[0]).toMatchObject({ market: BTC, redeemed: true });
    expect(await r.claims(desk)).toEqual([]); // held credit withdrawn: nothing left to claim
    expect((await r.walletActions(desk)).map((a) => a.name).sort()).toEqual(["CompleteSet", "CreditWithdrawn", "Redeemed"]);
    expect((await r.orders({ market: BTC })).map((o) => o.status).sort()).toEqual(["cancelled", "cancelled", "done", "done"]);
    expect((await r.prints(BTC)).length).toBe(2);
    expect((await r.candles(BTC, 0, 2_000_000_000)).length).toBeGreaterThan(0);
    expect((await r.printHistory("BTC", 0, 2_000_000_000)).length).toBe(2);
    expect(await r.status()).toMatchObject({ events: 29, fills: 2, windows_opened: 3, windows_resolved: 1 });
  });

  it("replaying the same window is a no-op (idempotent projections)", async () => {
    const before = await snapshot();
    const r = await indexWriter(sql).writeWindow(events, { chainId: 42431, address: ENGINE, block: events.at(-1)!.blockNumber });
    expect(r.inserted).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("out-of-order windows rebuild to the same projections, and a seq hole is reported", async () => {
    const before = await snapshot();
    const w = indexWriter(sql);
    await w.truncate();
    await w.upsertSeries(series);
    const cut = events.findIndex((e) => e.name === "PrintRecorded");
    const [early, late] = [events.slice(0, cut), events.slice(cut)];
    // Late half first, then the early half: the early events are below the applied seq → the BTC Market is rebuilt.
    await w.writeWindow(late, { chainId: 42431, address: ENGINE, block: 1 });
    expect((await w.gaps([BTC])).length).toBe(1);
    const r = await w.writeWindow(early, { chainId: 42431, address: ENGINE, block: 2 });
    expect(r.rebuilt).toContain(BTC);
    expect(await snapshot()).toEqual(before);
    expect(await w.gaps([BTC])).toEqual([]);
  });
});
