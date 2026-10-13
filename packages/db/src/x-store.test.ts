/**
 * The X stores against a throwaway Postgres 16 this test starts and stops (skipped where the binaries aren't installed):
 * a mention is claimed once, a final receipt is never downgraded, a stored hash is never replaced, links route one way,
 * and an OAuth state is taken exactly once, fresh, and never twice (S11, D-227).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { XReceipt } from "@cwf/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgXDelivery, createPgXStore, createSql, runMigrations, type Sql } from "./index";

const BIN = "/opt/homebrew/opt/postgresql@16/bin";
const hasPg = spawnSync(`${BIN}/initdb`, ["--version"]).status === 0;
const PORT = 55_439;
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const EXEC = "0x102229bcadb723d81a63167a962490a21daf08fc";

const mention = (id: string, over: Partial<XReceipt> = {}): XReceipt => ({
  mentionId: id, authorId: "42", handle: "someone", wallet: null, grantId: null, marketId: null, side: null, stakeBase: null,
  status: "submitted", reason: null, txHash: null, instruction: "@Mitoshi_app BTC up 5m $5", atMs: 1_760_000_000_000, ...over,
});

describe.skipIf(!hasPg)("X stores (links, receipts, OAuth state, replies)", () => {
  let dir: string;
  let server: ChildProcess;
  let sql: Sql;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cwf-pg-x-"));
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

  it("claims a mention once and queues one reply", async () => {
    const x = createPgXStore(sql);
    expect(await x.claimMention(mention("1"), true)).toBe(true);
    expect(await x.claimMention(mention("1"), true)).toBe(false);
    expect((await createPgXDelivery(sql).counts()).pending).toBe(1);
  });

  it("never downgrades a final receipt nor swaps its hash", async () => {
    const x = createPgXStore(sql);
    await x.claimMention(mention("2", { wallet: A }), false);
    await x.recordTx("2", "0xAAA");
    await x.saveReceipt(mention("2", { wallet: A, status: "filled", txHash: "0xaaa", executionActor: EXEC, bookedCostBase: "4990000" }));
    await x.saveReceipt(mention("2", { wallet: A, status: "unknown", txHash: null }));
    await x.saveReceipt(mention("2", { wallet: A, status: "filled", txHash: "0xbbb" }));
    const r = await x.receiptByMention("2");
    expect(r).toMatchObject({ status: "filled", txHash: "0xaaa", bookedCostBase: "4990000", executionActor: EXEC });
    expect(await x.receiptsByAccount(A, 10)).toHaveLength(1);
  });

  it("lists this executor's open mentions for recovery", async () => {
    const x = createPgXStore(sql);
    await x.claimMention(mention("3", { executionActor: EXEC }), false);
    expect((await x.unresolved(EXEC)).map((r) => r.mentionId)).toContain("3");
    expect(await x.unresolved(B)).toHaveLength(0);
  });

  it("routes one X account to one account, and re-points on a new link", async () => {
    const x = createPgXStore(sql);
    await x.upsertLink({ authorId: "42", handle: "someone", account: A, signature: "0x01", issuedAtMs: 1 });
    expect((await x.linkByAuthor("42"))?.account).toBe(A);
    await x.upsertLink({ authorId: "42", handle: "someone", account: B.toUpperCase().replace("0X", "0x"), signature: "0x02", issuedAtMs: 2 });
    expect((await x.linkByAuthor("42"))?.account).toBe(B);
    expect(await x.linkByAccount(A)).toBeNull();
    expect(await x.revokeLink("42", B)).toBe(true);
    expect(await x.linkByAuthor("42")).toBeNull();
  });

  it("takes an OAuth state exactly once, and never a stale one", async () => {
    const x = createPgXStore(sql);
    const row = { bindingHash: "b", caller: null, pkceVerifier: "v".repeat(43), appChallenge: null, returnPath: "/trade-from-x" };
    await x.putAuthorize("s1", row, 600);
    expect(await x.takeAuthorize("s1")).toEqual(row);
    expect(await x.takeAuthorize("s1")).toBeNull();
    await x.putAuthorize("s2", row, -1);
    expect(await x.takeAuthorize("s2")).toBeNull();
    await x.putNative("c1", "challenge", "session-token", 60);
    expect(await x.takeNative("c1")).toEqual({ appChallenge: "challenge", session: "session-token" });
    expect(await x.takeNative("c1")).toBeNull();
  });

  it("posts a reply once: pending → posting → sent, never back", async () => {
    const x = createPgXStore(sql);
    const d = createPgXDelivery(sql);
    await x.claimMention(mention("4"), true);
    expect(await d.ready()).not.toContain("4");
    await x.saveReceipt(mention("4", { status: "refused", refusalCode: "account-not-linked" }));
    expect(await d.ready()).toContain("4");
    expect(await d.beginPost("4", "reply")).toBe(true);
    expect(await d.beginPost("4", "reply")).toBe(false);
    await d.finish("4", "sent", "1900000000000000000", null);
    expect((await d.counts()).sent).toBe(1);
  });
});
