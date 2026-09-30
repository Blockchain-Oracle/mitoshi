/**
 * The vault projections over real chain data (index/0002, S7): every EventVault log on Moderato up to a block, written
 * through the indexer's writer, must agree with what the chain says at that block — each owner's buckets
 * (`accountOf`) and each grant's budget and revocation (`grantOf`) — and a replayed window changes nothing. Needs a
 * Postgres (`TEST_DATABASE_URL`); each run uses a fresh schema and drops it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations";
import { indexReader, indexWriter, type IdxEvent } from "./index";

const url = process.env.TEST_DATABASE_URL;
type Fixture = { toBlock: string; vault: string; events: IdxEvent[]; chain: { accounts: Record<string, { available: string; privateAvailable: string; totalDeposited: string; totalWithdrawn: string }>; grants: Record<string, { revoked: boolean; budget: string; owner: string }> } };
const fx = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "moderato-s7-vault.json"), "utf8")) as Fixture;
const events = fx.events.map((e) => ({ ...e, address: e.address.toLowerCase(), market: null }));

describe.skipIf(!url)("vault index projections (real Moderato logs)", () => {
  const schema = `t_${Date.now().toString(36)}_v`;
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
    accounts: await sql`select owner, available_base::text, private_available_base::text, deposited_base::text, withdrawn_base::text from idx_vault_accounts order by owner`,
    grants: await sql`select grant_id::text, owner, actor, revoked, budget_base::text, spent_base::text, taps, returned_base::text, market from idx_vault_grants order by grant_id`,
    executions: await sql`select tx_hash, log_index, owner, market, grant_id::text, is_buy, cash_delta::text, token_delta::text from idx_vault_executions order by tx_hash, log_index`,
    settlements: await sql`select owner, market, payout_base::text from idx_vault_settlements order by owner, market`,
  });

  it("agrees with the chain for every owner and grant at the fixture's block", async () => {
    const w = indexWriter(sql);
    const r = await w.writeWindow(events, { chainId: 42431, address: fx.vault, block: Number(fx.toBlock) });
    expect(r.inserted).toBe(events.length);
    expect(r.markets).toEqual([]); // vault events never join a Window rebuild
    const s = await snapshot();
    expect(s.accounts.map((a) => a.owner).sort()).toEqual(Object.keys(fx.chain.accounts).sort());
    for (const a of s.accounts) {
      const chain = fx.chain.accounts[a.owner as string]!;
      expect({ owner: a.owner, available: a.available_base, private: a.private_available_base, deposited: a.deposited_base, withdrawn: a.withdrawn_base }).toEqual({
        owner: a.owner, available: chain.available, private: chain.privateAvailable, deposited: chain.totalDeposited, withdrawn: chain.totalWithdrawn,
      });
    }
    expect(s.grants.map((g) => g.grant_id)).toEqual(Object.keys(fx.chain.grants).sort((x, y) => Number(x) - Number(y)));
    for (const g of s.grants) {
      const chain = fx.chain.grants[g.grant_id as string]!;
      expect({ id: g.grant_id, revoked: g.revoked, budget: g.budget_base, owner: g.owner }).toEqual({ id: g.grant_id, revoked: chain.revoked, budget: chain.budget, owner: chain.owner });
    }
    expect(s.executions).toHaveLength(events.filter((e) => e.name === "Executed").length);
    expect(s.settlements).toHaveLength(events.filter((e) => e.name === "Settled").length);
    // `/api/index/wallet/<owner>/vault` (C.4.5): the owner's account, every grant it made, its taps and settlements.
    const owner = Object.keys(fx.chain.accounts)[0]!;
    const [row] = (await indexReader(sql).vault(owner)) as [{ account: { available_base: string }; grants: { owner: string }[]; executions: unknown[] }];
    expect(row.account.available_base).toBe(fx.chain.accounts[owner]!.available);
    expect(row.grants.every((g) => g.owner === owner)).toBe(true);
    expect(row.grants.length).toBe(Object.values(fx.chain.grants).filter((g) => g.owner === owner).length);
  });

  it("replays as a no-op, and a truncate-and-replay rebuilds the same projections", async () => {
    const w = indexWriter(sql);
    const before = await snapshot();
    const again = await w.writeWindow(events, { chainId: 42431, address: fx.vault, block: Number(fx.toBlock) });
    expect(again.inserted).toBe(0);
    expect(await snapshot()).toEqual(before);
    await w.truncate();
    await w.writeWindow(events.slice(0, 10), { chainId: 42431, address: fx.vault, block: events[9]!.blockNumber });
    await w.writeWindow(events.slice(10), { chainId: 42431, address: fx.vault, block: Number(fx.toBlock) });
    expect(await snapshot()).toEqual(before);
  });
});
