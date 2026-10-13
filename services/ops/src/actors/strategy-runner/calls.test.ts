/**
 * A rule's calls on a real Postgres store (TEST_DATABASE_URL): the first pass past the trigger records the call in
 * words, a later pass that swings through the other trigger holds to the first side, and calls made before recording
 * existed come back from the fills (a fade's side turned back) — once.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeSpec, type OracleFollowSpec } from "@cwf/core";
import { createPgStrategyAttempts, createPgStrategyStore, runMigrations } from "@cwf/db";
import type { IndexedStrategy } from "@cwf/db/idx";
import type { RunnerWindow } from "@cwf/markets/ops";
import { backfillCalls, holdRuleCalls, tallySkips } from "./calls";
import type { Scan } from "./decide";

const url = process.env.TEST_DATABASE_URL;
const RUNNER = "0xca7bfa5cbdc7135ba178ca23cd2b12c123258b9a";
const SPEC: OracleFollowSpec = { preset: "reversion", lookback: 4, thresholdBps: 5 };
const meta = JSON.stringify({ name: "ETH Mean-reversion", description: "", spec: SPEC });
const strategy = { strategyId: "2", seriesSymbol: "ETH", metadata: meta } as IndexedStrategy;
const win = (n: number): RunnerWindow => ({
  marketId: `0x${String(n).repeat(64).slice(0, 64)}`, seriesId: `0x${"7c".repeat(32)}`, index: BigInt(n), spotSymbol: "ETH", cadenceSec: 300, tradingStartSec: 0, lockAtSec: 300, expirySec: 300,
  openPriceE8: 1n, grid: { lotBase: 1_000n, tickBase: 1_000n, cashUnit: 1n, minLots: 1_000n, decimals: 6 },
});
const scanOf = (w: RunnerWindow, moveBps: number): Scan => ({
  candidates: [{ window: w, decision: { side: moveBps < 0 ? "up" : "down", moveBps, thresholdBps: 5, reason: "" } }], scanned: 1, closestBps: 0, why: "",
});

it("tallies skipped copiers by reason, never one already in the Window", () => {
  expect(tallySkips(["budget", "budget", "in-window", "book"])).toEqual({ budget: 2, book: 1 });
  expect(encodeSpec(SPEC)).toContain("reversion");
});

describe.skipIf(!url)("rule calls (real store)", () => {
  const schema = `t_${Date.now().toString(36)}_c`;
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

  it("records the first call per Window in words and holds to its side", async () => {
    const store = createPgStrategyStore(sql);
    const w = win(1);
    const first = await holdRuleCalls({ store, strategy, spec: SPEC, scan: scanOf(w, -8), runner: RUNNER, nowMs: 1_791_909_715_000, dryRun: false });
    expect(first).toHaveLength(1);
    expect(await store.decisionOf("2", w.marketId, false)).toMatchObject({
      side: "up", gate: "trade", model: "rule/reversion", why: "ETH fell 0.08% from its opening print; it bets on a pullback.", gateReason: "0.08% move, past its 0.05% trigger", decidedAtMs: 1_791_909_715_000,
    });
    expect(await holdRuleCalls({ store, strategy, spec: SPEC, scan: scanOf(w, -9), runner: RUNNER, nowMs: 1_791_909_745_000, dryRun: false })).toHaveLength(1);
    expect(await holdRuleCalls({ store, strategy, spec: SPEC, scan: scanOf(w, 7), runner: RUNNER, nowMs: 1_791_909_775_000, dryRun: false })).toHaveLength(0);
    expect((await store.decisionCounts("2"))[0]).toMatchObject({ total: 1, bets: 1 });
  });

  it("recovers calls made before recording from their fills, once", async () => {
    const store = createPgStrategyStore(sql);
    const attempts = createPgStrategyAttempts(sql);
    const fill = (n: number, side: "up" | "down", mode: "follow" | "fade", owner: string, atSec: number) =>
      attempts.recordFill({ txHash: `0x${String(n).repeat(64).slice(0, 64)}`, strategyId: "2", grantId: "11", owner, marketId: win(n < 5 ? 3 : 4).marketId, side, mode, cashDelta: "1944215", tokenDelta: "4273000", atSec, dryRun: false });
    await fill(3, "down", "follow", "0x1ef9d7ec85393f9b68dca8980d266b574cc2ac18", 1_791_793_433);
    await fill(5, "up", "fade", "0x4ef8730000000000000000000000000000000000", 1_791_793_637);
    await fill(6, "down", "follow", "0x1ef9d7ec85393f9b68dca8980d266b574cc2ac18", 1_791_793_640);
    expect(await backfillCalls(store, [strategy], RUNNER)).toBe(2);
    expect(await backfillCalls(store, [strategy], RUNNER)).toBe(0);
    expect(await store.decisionOf("2", win(3).marketId, false)).toMatchObject({ side: "down", filled: 1, decidedAtMs: 1_791_793_433_000, why: "ETH rose at least 0.05% from its opening print; it bets on a pullback." });
    expect(await store.decisionOf("2", win(4).marketId, false)).toMatchObject({ side: "down", filled: 2, decidedAtMs: 1_791_793_637_000 });
    expect((await store.decisionCounts("2"))[0]).toMatchObject({ total: 3, bets: 3 });
  });
});
