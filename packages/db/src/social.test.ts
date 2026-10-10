/**
 * The social stores against a real throwaway Postgres 16 (skipped where the binaries aren't installed): S13's gate in
 * the store — a blocked author leaves the blocker's reads, a report reaches the queue and a hide takes the post out of
 * every read, and deleting an account leaves none of its off-chain rows. Where initdb refuses the shell's locale, run with
 * `LC_ALL=en_US.UTF-8 TMPDIR=/tmp` (the socket path must stay under macOS's 104 bytes).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgSocialModeration, createPgSocialPeople, createPgSocialPosts, createSql, runMigrations, type Sql, exportSocialData } from "./index";
import { hasCalled } from "./idx";

const BIN = "/opt/homebrew/opt/postgresql@16/bin";
const hasPg = spawnSync(`${BIN}/initdb`, ["--version"]).status === 0;
const PORT = 55_438;
const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";
const C = "0x00000000000000000000000000000000000000cc";
const MARKET = `0x${"11".repeat(32)}`;

describe.skipIf(!hasPg)("social stores (profiles, follows, blocks, rooms, takes, reactions, reports, deletion)", () => {
  let dir: string;
  let server: ChildProcess;
  let sql: Sql;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cwf-pg-social-"));
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

  it("keeps one name per person, case-insensitive, and refuses a bad one", async () => {
    const people = createPgSocialPeople(sql);
    expect(await people.setProfile(A, { displayName: "Kaito_77", bio: "UP into the close" })).toMatchObject({ ok: true });
    expect(await people.setProfile(B, { displayName: "kaito_77", bio: null })).toEqual({ ok: false, reason: "name_taken" });
    expect(await people.setProfile(B, { displayName: "no", bio: null })).toEqual({ ok: false, reason: "bad_name" });
    expect(await people.byName("KAITO_77")).toBe(A);
    expect((await people.profiles([A.toUpperCase().replace("0X", "0x"), B])).get(A)?.displayName).toBe("Kaito_77");
  });

  it("follows one way, never oneself", async () => {
    const people = createPgSocialPeople(sql);
    await people.follow(B, A);
    await people.follow(A, A);
    expect(await people.followCounts(A)).toEqual({ followers: 1, following: 0 });
    expect(await people.isFollowing(B, A)).toBe(true);
    await people.unfollow(B, A);
    expect(await people.isFollowing(B, A)).toBe(false);
  });

  it("drops a blocked author from the blocker's room and takes, and only theirs", async () => {
    const people = createPgSocialPeople(sql);
    const posts = createPgSocialPosts(sql);
    await posts.postComment({ room: "$TSLA", author: A, body: "gap up monday", via: "social" });
    await posts.postComment({ room: "$TSLA", author: B, body: "fading it", via: "passkey" });
    await posts.postTake({ marketId: MARKET, author: B, side: "down", caption: "$TSLA below the line", asset: "TSLA", intervalSec: 300, expirySec: 1_800_000_300, lineRaw: "38270000000", backed: true, tags: ["TSLA"], via: "passkey" });
    await people.block(A, B);
    expect((await posts.comments({ room: "$TSLA", viewer: A })).map((c) => c.author)).toEqual([A]);
    expect((await posts.comments({ room: "$TSLA", viewer: C })).map((c) => c.author)).toEqual([B, A]);
    expect(await posts.takes({ symbol: "TSLA", viewer: A })).toEqual([]);
    expect((await posts.takes({ symbol: "TSLA", viewer: C }))[0]).toMatchObject({ author: B, side: "down", tags: ["TSLA"], backed: true });
  });

  it("counts reactions per post and knows the viewer's own", async () => {
    const posts = createPgSocialPosts(sql);
    const [take] = await posts.takes({ symbol: "TSLA" });
    await posts.react({ target: "take", id: take!.id, reactor: A, kind: "fire", on: true });
    await posts.react({ target: "take", id: take!.id, reactor: C, kind: "fire", on: true });
    await posts.react({ target: "take", id: take!.id, reactor: C, kind: "eyes", on: true });
    await posts.react({ target: "take", id: take!.id, reactor: C, kind: "eyes", on: false });
    expect((await posts.reactions("take", [take!.id], C)).get(take!.id)).toEqual({ counts: { fire: 2 }, mine: ["fire"] });
  });

  it("puts a report in the queue once, and a hide takes the post out of every read", async () => {
    const posts = createPgSocialPosts(sql);
    const mod = createPgSocialModeration(sql);
    const [take] = await posts.takes({ symbol: "TSLA" });
    const first = await mod.report({ reporter: C, targetKind: "take", targetId: take!.id, targetAuthor: B, reason: "spam", note: null });
    expect((await mod.report({ reporter: C, targetKind: "take", targetId: take!.id, targetAuthor: B, reason: "abuse", note: null })).duplicate).toBe(true);
    const queue = await mod.openReports();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: first.id, reason: "spam", text: "$TSLA below the line", targetAuthor: B });
    expect(await mod.resolve(first.id, "hide")).toBe(true);
    expect(await posts.takes({ symbol: "TSLA", viewer: C })).toEqual([]);
    expect(await mod.openReports()).toEqual([]);
  });

  it("seats a room on a call made directly, through a Trading Balance, or registered — ever, on that Window or ticker", async () => {
    const OTHER = `0x${"22".repeat(32)}`;
    await sql`insert into idx_markets (market, symbol) values (${MARKET}, 'TSLA'), (${OTHER}, 'NVDA')`;
    await sql`insert into idx_fills (chain_id, tx_hash, log_index, market, seq, block_number, ts_sec, taker, taker_kind, maker, maker_kind, maker_order_id, path, price_ticks, lots, maker_remaining)
              values (42431, '0xf1', 0, ${MARKET}, 1, 10, 1000, ${A}, 0, '0x00000000000000000000000000000000000000ee', 1, 1, 0, 550, 1, 0)`;
    await sql`insert into idx_vault_executions (tx_hash, log_index, vault, block_number, owner, market, grant_id, outcome_idx, is_buy, cash_delta, token_delta, actor, at_sec)
              values ('0xf2', 1, '0x00000000000000000000000000000000000000dd', 11, ${C}, ${OTHER}, 1, 0, true, -1000000, 1000, ${C}, 1001)`;
    expect(await hasCalled(sql, { address: A, market: MARKET })).toBe(true);
    expect(await hasCalled(sql, { address: A, symbol: "TSLA" })).toBe(true);
    expect(await hasCalled(sql, { address: A, symbol: "NVDA" })).toBe(false);
    expect(await hasCalled(sql, { address: "0x00000000000000000000000000000000000000EE", market: MARKET })).toBe(true);
    expect(await hasCalled(sql, { address: C, symbol: "NVDA" })).toBe(true);
    expect(await hasCalled(sql, { address: C, market: MARKET })).toBe(false);
    expect(await hasCalled(sql, { address: B, symbol: "TSLA" })).toBe(false);
  });

  it("deletes every off-chain row an account has, and no one else's", async () => {
    const people = createPgSocialPeople(sql);
    const posts = createPgSocialPosts(sql);
    const mod = createPgSocialModeration(sql);
    await people.follow(C, B);
    // The export holds every row the deletion is about to remove, the hidden ones too.
    const before = await exportSocialData(sql, B);
    expect([before.takes.length, before.roomMessages.length, before.followers.length, before.blocks.length]).toEqual([1, 1, 1, 0]);
    expect(before.takes[0]).toMatchObject({ side: expect.any(String), tags: expect.any(Array) });
    const deleted = await mod.deleteAll(B);
    expect(deleted).toMatchObject({ comments: 1, takes: 1, follows: 1, blocks: 0, profile: 0 });
    // A's block of B is A's: B deleting their data never lifts it.
    const [kept] = await sql<{ n: number }[]>`select count(*)::int as n from social_blocks where blocker = ${A} and blocked = ${B}`;
    expect(kept?.n).toBe(1);
    expect((await posts.comments({ room: "$TSLA" })).map((c) => c.author)).toEqual([A]);
    const [row] = await sql<{ n: number }[]>`select (select count(*) from reactions)::int + (select count(*) from take_tags)::int as n`;
    expect(row?.n).toBe(0);
    expect((await people.profiles([A])).get(A)?.displayName).toBe("Kaito_77");
    const after = await exportSocialData(sql, B);
    expect([after.profile, after.takes, after.roomMessages, after.reactions, after.following, after.followers, after.blocks, after.reportsFiled, after.gameSeats]).toEqual([null, [], [], [], [], [], [], [], []]);
  });
});
