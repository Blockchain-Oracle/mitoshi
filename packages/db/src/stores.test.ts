/**
 * The relay ledger and faucet store against a real throwaway Postgres 16 this test starts and stops (skipped where the
 * binaries aren't installed): migrations apply, budgets count, a challenge is taken exactly once.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgFaucetStore, createPgKeychainStore, createPgLedger, createPgVitalsStore, createSql, runMigrations, type Sql } from "./index";

const BIN = "/opt/homebrew/opt/postgresql@16/bin";
const hasPg = spawnSync(`${BIN}/initdb`, ["--version"]).status === 0;
const PORT = 55_437;

describe.skipIf(!hasPg)("Postgres stores (relay ledger, faucet, keychain, vitals)", () => {
  let dir: string;
  let server: ChildProcess;
  let sql: Sql;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cwf-pg-"));
    spawnSync(`${BIN}/initdb`, ["-D", dir, "-U", "cwf", "--auth=trust"], { stdio: "ignore" });
    server = spawn(`${BIN}/postgres`, ["-D", dir, "-p", String(PORT), "-k", dir, "-h", "127.0.0.1"], { stdio: "ignore" });
    for (let i = 0; i < 50; i++) {
      if (spawnSync(`${BIN}/pg_isready`, ["-h", "127.0.0.1", "-p", String(PORT)]).status === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    sql = createSql(`postgres://cwf@127.0.0.1:${PORT}/postgres`);
    await runMigrations(sql);
  }, 30_000);
  afterAll(async () => {
    await sql?.end();
    server?.kill("SIGINT");
    await new Promise((r) => setTimeout(r, 300));
    rmSync(dir, { recursive: true, force: true });
  });

  it("records sponsorships and counts budgets by sender, device and window", async () => {
    const ledger = createPgLedger(sql);
    const base = { chainId: 42431, area: "noop", method: "eth_sendRawTransactionSync", txHash: null } as const;
    await ledger.record({ ...base, sender: "0x00000000000000000000000000000000000000A1", device: "d1", feeMicros: 1_000n, createdAtSec: 1_000 });
    await ledger.record({ ...base, sender: "0x00000000000000000000000000000000000000a1", device: "d2", feeMicros: 2_500n, createdAtSec: 2_000 });
    await ledger.record({ ...base, sender: "0x00000000000000000000000000000000000000b2", device: "d1", feeMicros: 7n, createdAtSec: 2_000 });
    expect(await ledger.totals({ sinceSec: 0, sender: "0x00000000000000000000000000000000000000a1" })).toEqual({ count: 2, feeMicros: 3_500n });
    expect(await ledger.totals({ sinceSec: 1_500, device: "d1" })).toEqual({ count: 1, feeMicros: 7n });
    expect(await ledger.totals({ sinceSec: 0 })).toEqual({ count: 3, feeMicros: 3_507n });
  });

  it("takes a faucet challenge exactly once and never after it expires", async () => {
    const store = createPgFaucetStore(sql);
    const c = { id: "c1", wallet: "0x00000000000000000000000000000000000000a1" as const, ipHash: "ip", message: "m", createdAtMs: 0, expiresAtMs: 10_000 };
    await store.saveChallenge(c);
    const [a, b] = await Promise.all([store.takeChallenge("c1", 5_000), store.takeChallenge("c1", 5_000)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await store.saveChallenge({ ...c, id: "c2" });
    expect(await store.takeChallenge("c2", 10_000)).toBeNull();
  });

  it("finds the last funded claim and counts claims per IP", async () => {
    const store = createPgFaucetStore(sql);
    await store.saveClaim({ id: "k1", wallet: "0x00000000000000000000000000000000000000A1", ipHash: "ip1", auth: "passkey-session", txHashes: ["0xaa"], status: "funded", createdAtMs: 100 });
    await store.saveClaim({ id: "k2", wallet: "0x00000000000000000000000000000000000000a1", ipHash: "ip1", auth: "signature", txHashes: [], status: "failed", createdAtMs: 200 });
    expect((await store.lastFunded("0x00000000000000000000000000000000000000a1"))?.id).toBe("k1");
    expect(await store.countSince(0, "ip1")).toBe(1);
    expect(await store.countSince(150)).toBe(0);
  });

  it("keeps one contiguous scanned range per account and stores each event once", async () => {
    const store = createPgKeychainStore(sql);
    const acct = "0x00000000000000000000000000000000000000B1";
    const e = { name: "KeyAuthorized" as const, blockNumber: 150n, logIndex: 2, txHash: "0x01" as const, keyId: "0x00000000000000000000000000000000000000c1" as const, token: null, signatureType: 1, expirySec: 0n, limit: null, amount: null };
    expect(await store.range(42431, acct)).toBeNull();
    await store.save(42431, acct, { lo: 100n, hi: 200n }, [e], 1);
    await store.save(42431, acct, { lo: 150n, hi: 300n }, [e], 2);
    await store.save(42431, acct, { lo: 0n, hi: 99n }, [], 3);
    expect(await store.range(42431, acct.toLowerCase())).toEqual({ lo: 0n, hi: 300n });
    expect(await store.events(42431, acct)).toEqual([{ ...e, keyId: e.keyId.toLowerCase() }]);
    expect(await store.events(4217, acct)).toEqual([]);
  });

  it("summarises field vitals as p75 per route and metric, per network and window", async () => {
    const store = createPgVitalsStore(sql);
    const lcp = (value: number, at: number, network = "testnet") => ({ route: "/markets", metric: "LCP" as const, value, rating: value <= 2_500 ? ("good" as const) : ("poor" as const), navigationType: "navigate", network, createdAtMs: at });
    await store.save([lcp(1_000, 100), lcp(2_000, 100), lcp(3_000, 100), lcp(4_000, 100), lcp(9_000, 1), lcp(500, 100, "mainnet")]);
    const [row] = await store.summary(50, "testnet");
    expect(row).toMatchObject({ route: "/markets", metric: "LCP", samples: 4, goodShare: 0.5 });
    expect(row!.p75).toBeCloseTo(3_250);
  });
});
