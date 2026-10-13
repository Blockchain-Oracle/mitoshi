/**
 * The recount against an in-memory index that answers the SQL the recount sends (R6): the index skips blocks, the chain
 * has logs in them, and the counts still compare over exactly the blocks the index holds; the gaps are reported; a
 * backfilled gap is compared on the next pass; a log the index lost is a mismatch that keeps its tile open; the key's
 * rate limit ends a pass early without losing what it compared.
 */
import { describe, expect, it } from "vitest";
import { createIndexerClient, type IndexerClient } from "./client";
import { GAP_PAGE, indexerCoverage } from "./coverage";
import { createIndexerPacer, IndexerRateLimitError } from "./pacer";
import type { TileState } from "./plan";
import { formatRange } from "./ranges";
import { recountPass, type ChainLog, type ChainLogWalk, type RecountRow, type RecountSource } from "./recount";

const ENGINE = "0x113ca86be942671e5290ed57d86297f0ecd61b6a";
const MAKER = "0xa31f6b5a585ff331cc13fd1c6faa282024ca32a6";
const FILLED = "0x4678662051dfdde3614d84316fe95ea4f0c45d0105190ba4b2610bb72fd64cf6";
const LIB_EVENT = "0xa669f01e54311b4f70f92a8c0e1fd805ee3972bd969a0585de051ddbf215ef04";
const QUOTED = "0x3fdd0adbba8f0f10845d00baba0d25b4135e6fab1eefbe3355427f742c15bb83";

const sources: RecountSource[] = [
  { area: "engine", contract: "EventsEngine", address: ENGINE, deployBlock: 1_000, events: [{ name: "Filled", signature: "Filled()", topic0: FILLED }] },
  { area: "engine", contract: "MatchLib", address: "0xb8dceeaf9bdb5fffde6cbb05abb946102f3132b1", deployBlock: 990, events: [{ name: "Matched", signature: "Matched()", topic0: LIB_EVENT }] },
  { area: "maker", contract: "MarketMakerVault", address: MAKER, deployBlock: 1_500, events: [{ name: "Quoted", signature: "Quoted()", topic0: QUOTED }] },
];

/** The chain: the engine logs a fill every 3rd block and a library event every 10th; the maker quotes every 7th. */
function chainLogs(to: number): ChainLog[] {
  const logs: ChainLog[] = [];
  for (let b = 1_000; b <= to; b++) {
    if (b % 3 === 0) logs.push({ blockNumber: BigInt(b), address: ENGINE, topic0: FILLED });
    if (b % 10 === 0) logs.push({ blockNumber: BigInt(b), address: ENGINE, topic0: LIB_EVENT });
    if (b >= 1_500 && b % 7 === 0) logs.push({ blockNumber: BigInt(b), address: MAKER, topic0: QUOTED });
  }
  return logs;
}

interface FakeIndex {
  held: Set<number>;
  logs: ChainLog[];
  queries: string[];
}

/** An index over `held` blocks holding the chain's logs in them, answering the recount's four SQL shapes. */
function fakeIndex(head: number, missing: (b: number) => boolean, logs: ChainLog[]): FakeIndex {
  const held = new Set<number>();
  for (let b = 1; b <= head; b++) if (!missing(b)) held.add(b);
  return { held, logs: logs.filter((l) => held.has(Number(l.blockNumber))), queries: [] };
}

const ok = (columns: string[], rows: unknown[][]) => new Response(JSON.stringify({ ok: true, columns, rows, row_count: rows.length }), { headers: { "content-type": "application/json" } });

function answer(index: FakeIndex, sql: string): Response {
  index.queries.push(sql);
  const sorted = [...index.held].sort((a, b) => a - b);
  if (sql === "SELECT max(num) AS head FROM blocks") return ok(["head"], [[sorted[sorted.length - 1]]]);
  let m = /^SELECT min\(num\) AS lo, max\(num\) AS hi FROM blocks WHERE num >= (\d+)$/.exec(sql);
  if (m) {
    const at = sorted.filter((b) => b >= Number(m![1]));
    return ok(["lo", "hi"], [[at[0] ?? null, at[at.length - 1] ?? null]]);
  }
  m = /FROM blocks WHERE num >= (\d+) AND num <= (\d+)\) AS d\) AS g WHERE g\.nxt > g\.num \+ 1 ORDER BY gap_from LIMIT (\d+)$/.exec(sql);
  if (m) {
    const [from, to, limit] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const nums = sorted.filter((b) => b >= from && b <= to);
    const gaps: number[][] = [];
    for (let i = 0; i + 1 < nums.length && gaps.length < limit; i++) if (nums[i + 1]! > nums[i]! + 1) gaps.push([nums[i]! + 1, nums[i + 1]! - 1]);
    return ok(["gap_from", "gap_to"], gaps);
  }
  if (sql.startsWith("SELECT address, selector, count(*) AS n FROM logs")) {
    const addresses = [...sql.matchAll(/address = '(0x[0-9a-f]+)'/g)].map((x) => x[1]!);
    const ranges = [...sql.matchAll(/block_num >= (\d+) AND block_num <= (\d+)/g)].map((x) => [Number(x[1]), Number(x[2])] as const);
    const counts = new Map<string, number>();
    for (const l of index.logs) {
      const b = Number(l.blockNumber);
      if (!addresses.includes(l.address) || !ranges.some(([a, z]) => b >= a && b <= z)) continue;
      const key = `${l.address}|${l.topic0}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return ok(["address", "selector", "n"], [...counts].map(([k, n]) => [...k.split("|"), n]));
  }
  throw new Error(`unexpected SQL: ${sql}`);
}

const client = (index: FakeIndex, extra: Partial<IndexerClient> = {}): IndexerClient => ({
  ...createIndexerClient(42431, { kind: "mpp", session: { fetch: async (u) => answer(index, new URL(String(u)).searchParams.get("sql")!) } }),
  ...extra,
});

const walkOf = (logs: ChainLog[]): ChainLogWalk & { calls: string[] } => {
  const calls: string[] = [];
  const walk = async (addresses: readonly string[], from: bigint, to: bigint, onLogs: (logs: ChainLog[]) => void) => {
    calls.push(`${from}-${to}`);
    const wanted = new Set(addresses.map((a) => a.toLowerCase()));
    onLogs(logs.filter((l) => wanted.has(l.address) && l.blockNumber >= from && l.blockNumber <= to));
  };
  return Object.assign(walk, { calls });
};

function store(initial: TileState[] = []) {
  const tiles = new Map(initial.map((t) => [t.tileFrom, t]));
  const rows: RecountRow[] = [];
  return { tiles, rows, commit: async ({ tile, rows: r }: { tile: TileState | null; rows: RecountRow[] }) => void (rows.push(...r), tile && tiles.set(tile.tileFrom, tile)) };
}

describe("coverage", () => {
  it("lists the index's gaps from a start block to its head: leading, interior, across pages", async () => {
    // Every odd block missing past 10,000: more gaps than one page holds.
    const index = fakeIndex(2 * GAP_PAGE + 10_400, (b) => (b > 10_000 && b % 2 === 1) || (b >= 50 && b <= 59) || b < 5, []);
    const cov = await indexerCoverage(client(index), 1n);
    expect(cov.head).toBe(BigInt(2 * GAP_PAGE + 10_400));
    expect(cov.gaps.slice(0, 2).map(formatRange)).toEqual(["1–4", "50–59"]);
    expect(cov.gaps).toHaveLength(1 + 1 + 5_200);
    expect(index.queries.filter((q) => q.includes("lead(")).length).toBe(2);
    expect(cov.gaps[cov.gaps.length - 1]).toEqual({ from: BigInt(2 * GAP_PAGE + 10_399), to: BigInt(2 * GAP_PAGE + 10_399) });
  });
});

describe("recount pass", () => {
  const HEAD = 2_400;
  const logs = chainLogs(HEAD);
  const missing = (b: number) => (b >= 1_200 && b <= 1_259) || b === 2_001;

  it("compares the blocks the index holds, reports its gaps, and records each tile", async () => {
    const index = fakeIndex(HEAD, missing, logs);
    const walk = walkOf(logs);
    const s = store();
    const result = await recountPass({ chainId: 42431, indexer: client(index), sources, walk, headBlock: 5_000n, tiles: [], commit: s.commit, confirmations: 0n, tileBlocks: 500n });
    expect(result.toBlock).toBe(2_400n);
    expect(result.gaps.map(formatRange)).toEqual(["1200–1259", "2001"]);
    expect(result.mismatches).toEqual([]);
    expect(result.items).toEqual({ done: 4, left: 0 });
    expect(result.compared).toEqual({ blocks: 1_411n - 61n, of: 1_411n });
    // Chain logs inside the gaps exist but are not counted on either side.
    const filled = s.rows.filter((r) => r.contract === "EventsEngine" && r.event === "Filled").reduce((n, r) => n + r.localCount, 0n);
    const expected = logs.filter((l) => l.topic0 === FILLED && !missing(Number(l.blockNumber)) && l.blockNumber <= 2_400n).length;
    expect(filled).toBe(BigInt(expected));
    // A library's event under the engine's address is compared and named from the manifest.
    expect(s.rows.some((r) => r.contract === "EventsEngine" && r.event === "Matched")).toBe(true);
    expect(s.tiles.get(500n)).toMatchObject({ from: 990n, to: 999n, gaps: [] });
    expect(s.tiles.get(1_000n)).toMatchObject({ from: 1_000n, to: 1_499n, gaps: [{ from: 1_200n, to: 1_259n }] });
    expect(s.tiles.get(2_000n)!.gaps).toEqual([{ from: 2_001n, to: 2_001n }]);
  });

  it("compares a gap once the index backfills it, and only the new head blocks", async () => {
    const index = fakeIndex(HEAD, missing, logs);
    const s = store();
    await recountPass({ chainId: 42431, indexer: client(index), sources, walk: walkOf(logs), headBlock: 5_000n, tiles: [], commit: s.commit, confirmations: 0n, tileBlocks: 500n });
    s.rows.length = 0;
    // The index backfills 1200–1259 and follows the chain to 2,600.
    const later = fakeIndex(2_600, (b) => b === 2_001, chainLogs(2_600));
    const walk = walkOf(chainLogs(2_600));
    const result = await recountPass({ chainId: 42431, indexer: client(later), sources, walk, headBlock: 5_000n, tiles: [...s.tiles.values()], commit: s.commit, confirmations: 0n, tileBlocks: 500n });
    expect(result.mismatches).toEqual([]);
    expect(walk.calls).toEqual(["2500-2600", "1200-1259", "2401-2499"]);
    expect(s.tiles.get(1_000n)!.gaps).toEqual([]);
    expect(result.compared).toEqual({ blocks: 1_611n - 1n, of: 1_611n });
  });

  it("names a log the index lost, keeps that tile open, and still records the rest", async () => {
    const index = fakeIndex(HEAD, missing, logs);
    index.logs = index.logs.filter((l) => !(l.blockNumber === 1_602n && l.topic0 === FILLED));
    const s = store();
    const result = await recountPass({ chainId: 42431, indexer: client(index), sources, walk: walkOf(logs), headBlock: 5_000n, tiles: [], commit: s.commit, confirmations: 0n, tileBlocks: 500n });
    expect(result.mismatches.map((m) => [m.contract, m.event, m.indexerCount, m.localCount, formatRange({ from: m.fromBlock, to: m.toBlock })])).toEqual([["EventsEngine", "Filled", 166n, 167n, "1500–1999"]]);
    expect(s.tiles.has(1_500n)).toBe(false);
    expect(s.tiles.has(1_000n) && s.tiles.has(2_000n)).toBe(true);
    expect(s.rows.filter((r) => !r.match)).toHaveLength(1);
  });

  it("stops at the key's rate limit with what it compared so far committed", async () => {
    const index = fakeIndex(HEAD, missing, logs);
    let answered = 0;
    const limitedClient = client(index, {
      query: async (q) => {
        if (++answered > 4) throw new IndexerRateLimitError(42_000, 20);
        return client(index).query(q);
      },
    });
    const s = store();
    const result = await recountPass({ chainId: 42431, indexer: limitedClient, sources, walk: walkOf(logs), headBlock: 5_000n, tiles: [], commit: s.commit, confirmations: 0n, tileBlocks: 500n });
    expect(result.stopped).toEqual({ by: "rate-limit", retryAfterMs: 42_000 });
    expect(result.items).toEqual({ done: 1, left: 3 });
    expect(s.tiles.size).toBe(1);
  });

  it("starts no item after the time budget", async () => {
    let t = 0;
    const index = fakeIndex(HEAD, missing, logs);
    const s = store();
    const slowWalk: ChainLogWalk = async (a, f, z, on) => ((t += 61_000), walkOf(logs)(a, f, z, on));
    const result = await recountPass({ chainId: 42431, indexer: client(index), sources, walk: slowWalk, headBlock: 5_000n, tiles: [], commit: s.commit, confirmations: 0n, tileBlocks: 500n, budgetMs: 120_000, now: () => t });
    expect(result.stopped).toEqual({ by: "budget" });
    expect(result.items).toEqual({ done: 2, left: 2 });
  });

  it("paces its queries through the client's pacer", async () => {
    const index = fakeIndex(HEAD, missing, logs);
    let t = 0;
    const pacer = createIndexerPacer({ minIntervalMs: 3_500, now: () => t, sleep: async (ms) => void (t += ms), random: () => 0 });
    const paced = createIndexerClient(42431, { kind: "mpp", session: { fetch: async (u) => answer(index, new URL(String(u)).searchParams.get("sql")!) } }, { pacer });
    await recountPass({ chainId: 42431, indexer: paced, sources, walk: walkOf(logs), headBlock: 5_000n, tiles: [], commit: store().commit, confirmations: 0n, tileBlocks: 500n });
    // head + span + gaps + one count per tile, 3.5 s apart.
    expect(pacer.stats().requests).toBe(7);
    expect(t).toBe(6 * 3_500);
  });
});
