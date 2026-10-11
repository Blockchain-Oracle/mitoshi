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
});
