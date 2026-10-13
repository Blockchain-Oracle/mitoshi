/**
 * One pass over two Windows marks each Window's decision with its own counts — never the pass's totals — and a real
 * store keeps the filled count a live fill set (`TEST_DATABASE_URL`, a fresh schema per run).
 */
import postgres from "postgres";
import type { Address, Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgStrategyAttempts, createPgStrategyStore, runMigrations } from "@cwf/db";
import type { RunnerWindow, SubscriberState } from "@cwf/markets/ops";
import type { Candidate } from "./decide";
import { executeCalls, type ExecutionResult } from "./execute";

const RUNNER = "0xca7bfa5cbdc7135ba178ca23cd2b12c123258b9a";
const A = "0x00000000000000000000000000000000000000a1" as Address;
const B = "0x00000000000000000000000000000000000000b2" as Address;
const win = (n: number): RunnerWindow => ({
  marketId: `0x${String(n).repeat(64).slice(0, 64)}` as Hex, seriesId: `0x${"7c".repeat(32)}`, index: BigInt(n), spotSymbol: "ETH", cadenceSec: 300, tradingStartSec: 0, lockAtSec: 300, expirySec: 300,
  openPriceE8: 1n, grid: { lotBase: 1_000n, tickBase: 1_000n, cashUnit: 1n, minLots: 1_000n, decimals: 6 },
});
const call = (n: number): Candidate => ({ window: win(n), decision: { side: "up", moveBps: -8, thresholdBps: 5, reason: "" } });
const sub = (owner: Address): SubscriberState => ({ owner, grantId: 11n, mode: "follow", grant: null, live: true });
const TX = `0x${"11".repeat(32)}` as Hex;

/** Window 1: A fills, B is out of budget. Window 2: A is already in, B finds no fill. */
const outcomes: Record<string, ExecutionResult> = {
  [`1:${A}`]: { status: "filled", txHash: TX, side: "up", cashDeltaBase: 1_944_215n, tokenDeltaRaw: 4_273_000n },
  [`1:${B}`]: { status: "skipped", reason: "$0.02 left of its copy budget", code: "budget" },
  [`2:${A}`]: { status: "skipped", reason: "already in this Window", code: "in-window" },
  [`2:${B}`]: { status: "skipped", reason: "nothing rests to fill", code: "book" },
};
const execute = async (s: SubscriberState, c: Candidate) => outcomes[`${Number(c.window.index)}:${s.owner}`]!;

describe("a pass's execution, by Window", () => {
  it("marks each Window with its own filled and skipped counts", async () => {
    const marked: [string, number, number][] = [];
    const store = { markDecisionExecution: async (_s: string, marketId: string, filled: number, skipped: number) => void marked.push([marketId, filled, skipped]) };
    const fills: string[] = [];
    const run = await executeCalls({ strategyId: "2", candidates: [call(1), call(2)], subs: [sub(A), sub(B)], dryRun: false, store, execute, onFilled: (s) => fills.push(s.owner) });
    expect(marked).toEqual([[win(1).marketId, 1, 1], [win(2).marketId, 0, 1]]);
    expect(run).toMatchObject({ filled: 1, skips: ["budget", "in-window", "book"], unknown: null });
    expect(fills).toEqual([A]);
  });

  it("stops at a send whose confirmation is unknown and marks nothing", async () => {
    const marked: string[] = [];
    const store = { markDecisionExecution: async (_s: string, marketId: string) => void marked.push(marketId) };
    const run = await executeCalls({ strategyId: "2", candidates: [call(1)], subs: [sub(A), sub(B)], dryRun: false, store, execute: async () => ({ status: "unknown", reason: "rpc timeout" }) });
    expect(run.unknown).toBe("rpc timeout");
    expect(marked).toEqual([]);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("a pass's execution (real store)", () => {
  const schema = `t_${Date.now().toString(36)}_x`;
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

  it("keeps a Window's live fill count and gives the other Window none of it", async () => {
    const store = createPgStrategyStore(sql);
    for (const n of [1, 2]) await store.recordCall({ strategyId: "2", marketId: win(n).marketId, runner: RUNNER, model: "rule/reversion", why: "", gateReason: "", side: "up", decidedAtMs: 1_791_909_715_000, dryRun: false });
    const attempts = createPgStrategyAttempts(sql);
    // The real send records its fill (and the decision's filled count) before the pass marks the Window.
    const live = async (s: SubscriberState, c: Candidate): Promise<ExecutionResult> => {
      const r = await execute(s, c);
      if (r.status === "filled") {
        await attempts.begin({ strategyId: "2", marketId: c.window.marketId, owner: s.owner, runner: RUNNER, grantId: "11", side: "up", mode: "follow", stakeBase: "2000000", fromBlock: "1", nonce: 0 });
        await attempts.recordFill({ txHash: r.txHash, strategyId: "2", grantId: "11", owner: s.owner, marketId: c.window.marketId, side: "up", mode: "follow", cashDelta: "1944215", tokenDelta: "4273000", atSec: 1_791_909_716, dryRun: false });
      }
      return r;
    };
    await executeCalls({ strategyId: "2", candidates: [call(1), call(2)], subs: [sub(A), sub(B)], dryRun: false, store, execute: live });
    expect(await store.decisionOf("2", win(1).marketId, false)).toMatchObject({ filled: 1, skipped: 1 });
    expect(await store.decisionOf("2", win(2).marketId, false)).toMatchObject({ filled: 0, skipped: 1 });
  });
});
