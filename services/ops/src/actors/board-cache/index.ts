/**
 * The shared board (R6 shell S04, D-230): N viewers cost the RPC one read. Every browser used to read each Window and
 * its book from the public RPC itself and re-read on every engine event — a thundering herd per viewer that rate-limited
 * whole offices. This actor holds one board instead: each Window that opened and expires no more than 15 min ago (the
 * lanes, then the settling and the verdict), its lens facts and its takers' book at `BOARD_DEPTH`, read the browser's own
 * way (`readBoardEntries`) on its own paced client — `BOARD_RPC_URL`, else the public RPC; never the actors' key.
 *
 * Fresh two ways: an engine event for Window X marks X, and once a second the marked Windows are read again (one batch);
 * every 15 s a sweep reads them all, so a missed event heals. A changed Window is announced on its own `market:<id>`
 * topic as `window`, a changed live set on `markets` as `board` — light frames; the browser fetches the values from
 * `GET /v1/board` / `/v1/windows`, which answer from memory. Reads only; signs nothing, so DRY_RUN changes nothing.
 */
import { indexReader } from "@cwf/db/idx";
import { TEMPO_RPC_HTTP, type MarketId } from "@cwf/core";
import { BOARD_VERSION, configureMarkets, encodeBoard, liveIds, parseMarketsEnv, readBoardEntries, setReadBudget, sharedRpcBudget, WINDOW_EVENTS, type BoardEntry } from "@cwf/markets/board";
import { errorText, runActor, type VenueDeps } from "../../runtime";

export const BOARD_SWEEP_MS = 15_000;
export const BOARD_FLUSH_MS = 1_000;
/** Windows that expired this recently stay on the board: their settling countdown and verdict still read them. */
const RECENT_SEC = 15 * 60;
/**
 * The board's own RPC pace (units/s; an `eth_call` weighs 3): a sweep of ~100 Windows is ~7 sliced multicalls, a second's
 * marked Windows ~3. 24 stays under the public RPC's ~13 calls/s per IP; `BOARD_RPC_UNITS` tunes it.
 */
const BOARD_UNITS_PER_SEC = Number(process.env.BOARD_RPC_UNITS) || 24;
/** At most this many ids per `/v1/windows` request. */
export const MAX_IDS = 100;

let entries = new Map<MarketId, BoardEntry>();
let live: MarketId[] = [];
let asOfMs = 0;
let running = false;
/** `/v1/board`'s body, encoded once per change. */
let encoded: { asOfMs: number; text: string } | null = null;

/** What `/v1/board` serves; null before the first sweep or where this actor doesn't run. */
export function boardBody(): { text: string; etag: string } | null {
  if (!running || asOfMs === 0) return null;
  if (encoded?.asOfMs !== asOfMs) encoded = { asOfMs, text: encodeBoard({ v: BOARD_VERSION, asOfMs, live, windows: Object.fromEntries(entries) }) };
  return { text: encoded.text, etag: `"b${asOfMs}"` };
}

/** What `/v1/windows?ids=` serves: the named Windows the board holds (an unknown id is simply absent). */
export function windowsBody(ids: readonly string[]): { text: string; etag: string } | null {
  if (!running || asOfMs === 0) return null;
  const picked = ids.flatMap((id) => {
    const e = entries.get(id.toLowerCase() as MarketId);
    return e ? [[id.toLowerCase(), e] as const] : [];
  });
  const newest = picked.reduce((m, [, e]) => Math.max(m, e.atMs), 0);
  return { text: encodeBoard({ v: BOARD_VERSION, asOfMs: newest || asOfMs, live: null, windows: Object.fromEntries(picked) }), etag: `"w${newest}-${picked.length}"` };
}

/** An entry's content, its read time aside: a Window is announced only when this changes. */
const sig = (e: BoardEntry) => encodeBoard({ v: BOARD_VERSION, asOfMs: 0, live: null, windows: { x: { ...e, atMs: 0 } } });

export function startBoardCache(d: VenueDeps): { stop(): void } {
  const sql = d.sql;
  if (!sql) throw new Error("board-cache needs DATABASE_URL (the live Window ids)");
  const rpc = process.env.BOARD_RPC_URL || TEMPO_RPC_HTTP[d.env.network];
  configureMarkets(parseMarketsEnv({ network: d.env.network, rpcHttpUrls: [rpc], rpcWsUrls: "none" }));
  setReadBudget({ budget: sharedRpcBudget(rpc, BOARD_UNITS_PER_SEC), tier: 2 });
  const reader = indexReader(sql);
  return runBoard({
    bus: d.bus,
    log: d.log,
    // Every Window that opened and expires no more than RECENT_SEC ago (the live ones and the settling).
    listIds: async () => (await reader.markets({ expiryFromSec: Math.floor(Date.now() / 1000) - RECENT_SEC, limit: 500 })).map((r) => String(r.market).toLowerCase() as MarketId),
    read: (ids) => readBoardEntries(ids),
  });
}

export interface BoardRunDeps {
  bus: VenueDeps["bus"];
  log: (why: string) => void;
  listIds: () => Promise<MarketId[]>;
  read: (ids: readonly MarketId[]) => Promise<Map<MarketId, BoardEntry>>;
  sweepMs?: number;
  flushMs?: number;
}

/** The board's loop, its reads injected (tests drive it with fakes). */
export function runBoard(d: BoardRunDeps): { stop(): void } {
  entries = new Map();
  live = [];
  asOfMs = 0;
  encoded = null;
  running = true;
  let reads = 0;
  let lastSweepMs = 0;

  /** Folds fresh reads in; announces each changed Window, then the live set if it moved. */
  const commit = (read: Map<MarketId, BoardEntry>, keep: (id: MarketId) => boolean) => {
    const next = new Map<MarketId, BoardEntry>();
    for (const [id, e] of entries) if (keep(id)) next.set(id, e);
    const changed: MarketId[] = [];
    for (const [id, e] of read) {
      const before = entries.get(id);
      if (!before || sig(before) !== sig(e)) changed.push(id);
      next.set(id, e);
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const nextLive = liveIds(next.values(), nowSec);
    const liveMoved = nextLive.join() !== live.join();
    entries = next;
    live = nextLive;
    asOfMs = Math.max(asOfMs, ...[...read.values()].map((e) => e.atMs), Date.now());
    for (const id of changed) d.bus.publish(`market:${id}`, "window", { market: id, asOfMs });
    if (liveMoved) d.bus.publish("markets", "board", { asOfMs, live: live.length });
  };

  // Events: mark the Window; one batched read a second for everything marked.
  const dirty = new Set<MarketId>();
  const unsubscribe = d.bus.subscribe((e) => {
    if (e.topic.startsWith("market:") && WINDOW_EVENTS.has(e.event)) dirty.add(e.topic.slice(7).toLowerCase() as MarketId);
  });
  let flushing = false;
  const flush = setInterval(() => {
    if (flushing || dirty.size === 0) return;
    flushing = true;
    const ids = [...dirty];
    dirty.clear();
    d.read(ids)
      .then((read) => {
        reads += 1;
        commit(read, () => true);
      })
      .catch((error) => {
        for (const id of ids) dirty.add(id);
        d.log(`event read failed (${ids.length} Windows, retried next second): ${errorText(error)}`);
      })
      .finally(() => (flushing = false));
  }, d.flushMs ?? BOARD_FLUSH_MS);
  flush.unref?.();

  const actor = runActor({
    name: "board-cache",
    log: d.log,
    dryRun: false,
    critical: false,
    everyMs: d.sweepMs ?? BOARD_SWEEP_MS,
    pass: async () => {
      const ids = await d.listIds();
      const startedMs = Date.now();
      const read = await d.read(ids);
      lastSweepMs = Date.now() - startedMs;
      reads += 1;
      const wanted = new Set(ids);
      // A Window whose read failed this sweep keeps its last entry (the browser's staleness guard drops it if it ages).
      commit(read, (id) => wanted.has(id));
      return { why: `${entries.size} Windows (${live.length} live), swept in ${lastSweepMs} ms`, detail: { windows: entries.size, live: live.length, asOfMs, lastSweepMs, reads } };
    },
  });
  return {
    stop() {
      running = false;
      clearInterval(flush);
      unsubscribe();
      actor.stop();
    },
  };
}
