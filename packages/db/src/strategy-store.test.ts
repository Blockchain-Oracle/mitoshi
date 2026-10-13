/**
 * The runner's store on a real Postgres (migrations/strategies; S9): a decision is reserved once per Window, an attempt
 * once per subscriber, a fill and its attempt commit together (a fade's mode kept), and the decision counts it.
 * Needs `TEST_DATABASE_URL`; each run uses a fresh schema and drops it.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { createPgStrategyAttempts } from "./strategy-attempts";
import { createPgStrategyStore } from "./strategy-store";

const url = process.env.TEST_DATABASE_URL;
const MARKET = `0x${"ab".repeat(32)}`;
const RUNNER = "0xCA7BFA5CBDC7135BA178CA23CD2B12C123258B9A";
const OWNER = "0x00000000000000000000000000000000000000A1";

describe.skipIf(!url)("strategy store (runner records)", () => {
  const schema = `t_${Date.now().toString(36)}_r`;
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

  it("reserves one read per Window, records the ruling once, and a dead read holds its Window", async () => {
    const store = createPgStrategyStore(sql);
    const d = { strategyId: "3", marketId: MARKET, runner: RUNNER, model: "anthropic/claude-opus-5-5", promptHash: "h", dryRun: false };
    expect(await store.beginDecision(d)).toBe("acquired");
    expect(await store.beginDecision(d)).toBe("existing");
    expect(await store.recordDecision({ ...d, verdictSide: "up", confidence: 0.7, why: "book agrees", gate: "trade", gateReason: "ok", side: "up" })).toBe(true);
    expect(await store.recordDecision({ ...d, verdictSide: "down", confidence: 0.9, why: "again", gate: "trade", gateReason: "ok", side: "down" })).toBe(false);
    expect((await store.decisionOf("3", MARKET, false))?.side).toBe("up");

    const other = { ...d, marketId: `0x${"cd".repeat(32)}` };
    await store.beginDecision(other);
    await store.interruptDecisions(RUNNER, Date.now() + 1_000);
    expect((await store.decisionOf("3", other.marketId, false))?.gate).toBe("failed");
  });

  it("reserves an attempt once, then the fill and the attempt commit together with the fade's mode", async () => {
    const store = createPgStrategyStore(sql);
    const attempts = createPgStrategyAttempts(sql);
    const a = { strategyId: "3", marketId: MARKET, owner: OWNER, runner: RUNNER, grantId: "7", side: "down" as const, mode: "fade" as const, stakeBase: "2000000", fromBlock: "39057400", nonce: 1 };
    expect(await attempts.begin(a)).toBe(true);
    expect(await attempts.begin(a)).toBe(false);
    expect((await attempts.unresolved(RUNNER)).map((x) => x.owner)).toEqual([OWNER.toLowerCase()]);
    await attempts.recordFill({ txHash: `0x${"11".repeat(32)}`, strategyId: "3", grantId: "7", owner: OWNER, marketId: MARKET, side: "down", mode: "fade", cashDelta: "1200000", tokenDelta: "2000000", atSec: 1_791_700_000, dryRun: false });
    expect((await attempts.get(a))?.state).toBe("filled");
    expect(await attempts.unresolved(RUNNER)).toEqual([]);
    const [fill] = await store.listFills({ strategyId: "3", limit: 10 });
    expect(fill).toMatchObject({ side: "down", mode: "fade", owner: OWNER.toLowerCase() });
    expect((await store.decisionOf("3", MARKET, false))?.filled).toBe(1);
  });

  it("records a rule's call once per Window, counts every strategy's decisions and keeps a beat's state", async () => {
    const store = createPgStrategyStore(sql);
    const call = { strategyId: "2", marketId: MARKET, runner: RUNNER, model: "rule/reversion", why: "ETH fell 0.08% from its opening print; it bets on a pullback.", gateReason: "0.08% move, past its 0.05% trigger", side: "up" as const, decidedAtMs: 1_791_700_000_000, dryRun: false };
    expect(await store.recordCall(call)).toBe(true);
    expect(await store.recordCall({ ...call, side: "down" })).toBe(false);
    expect(await store.decisionOf("2", MARKET, false)).toMatchObject({ gate: "trade", side: "up", verdictSide: "up", confidence: null, model: "rule/reversion", decidedAtMs: 1_791_700_000_000 });
    await store.recordCall({ ...call, marketId: `0x${"ef".repeat(32)}`, decidedAtMs: 1_791_700_300_000, filled: 2 });
    await store.recordCall({ ...call, marketId: `0x${"ee".repeat(32)}`, dryRun: true });
    expect((await store.listDecisions(null, 50, false, true)).every((d) => !d.model.startsWith("rule/"))).toBe(true);
    const latest = await store.latestDecisionsPerStrategy(1);
    expect(latest.map((d) => d.strategyId).sort()).toEqual(["2", "3"]);
    expect(latest.find((d) => d.strategyId === "2")?.decidedAtMs).toBe(1_791_700_300_000);
    const counts = await store.decisionCounts();
    expect(counts.find((c) => c.strategyId === "2")).toEqual({ strategyId: "2", total: 2, bets: 2, held: 0, failed: 0, lastAtMs: 1_791_700_300_000 });
    expect((await store.decisionCounts("3"))[0]).toMatchObject({ total: 2, bets: 1, failed: 1 });

    const state = { kind: "scan" as const, copiers: 1, windows: 1, closestBps: null, calls: 1, filled: 0, skipped: { budget: 1 } };
    await store.recordHeartbeat({ runner: RUNNER, strategyId: "2", intervalMs: 30_000, why: "scanned 1 Window", scanned: 1, closestBps: null, dryRun: false, state });
    await store.recordHeartbeat({ runner: RUNNER, strategyId: "1", intervalMs: 30_000, why: "older shape", scanned: 0, closestBps: null, dryRun: false });
    const beats = await store.latestHeartbeats();
    expect(beats.find((b) => b.strategyId === "2")?.state).toEqual(state);
    expect(beats.find((b) => b.strategyId === "1")?.state).toBeNull();
  });

  it("reads heartbeats before strategies/0005 has run (a web shipped ahead of ops): the older shape, state null", async () => {
    const store = createPgStrategyStore(sql);
    await sql`alter table runner_heartbeats drop column state`;
    try {
      expect((await store.latestHeartbeats()).find((b) => b.strategyId === "2")).toMatchObject({ why: "scanned 1 Window", state: null });
      expect((await store.recentHeartbeats("2", 5)).map((b) => b.state)).toEqual([null]);
    } finally {
      await sql`alter table runner_heartbeats add column state jsonb`;
    }
  });
});
