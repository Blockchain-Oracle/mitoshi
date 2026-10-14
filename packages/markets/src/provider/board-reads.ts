/**
 * Display reads from ops' shared board (R6 shell S04): the lane list, the cards, the hero and the ticket's book read
 * `GET /v1/board` / `/v1/windows` — one ops answer from memory — instead of every tab reading the public RPC itself.
 * Anything the board doesn't hold fresh comes back absent and the caller reads the chain as before; a failed or stale
 * board turns ops off for this tab for `BACKOFF_MS`. Never the write gate: `freshQuoteStake`, `freshExitQuote` and the
 * send's own lens read stay head-fresh on the chain (canon #1).
 *
 * The query layer decides when to read (mount, a stream frame, its interval); this module only shares: reads asked for
 * in one macrotask go out as one request, and an answer under `REUSE_MS` old serves again (the lane list, then its cards).
 */
import type { MarketId } from "@cwf/core";
import { BOARD_STALE_MS, decodeBoard, type BoardEntry, type BoardWire } from "../board/wire";
import { nowMs } from "../runtime/clock";
import { marketsEnv } from "../runtime/read-runtime";

const FETCH_TIMEOUT_MS = 4_000;
export const REUSE_MS = 1_000;
const BACKOFF_MS = 30_000;
/** A Window ops said it doesn't hold (an old settled one) goes straight to the chain for this long. */
const ABSENT_MS = 60_000;
const CHUNK = 40;

const held = new Map<string, { entry: BoardEntry; gotMs: number }>();
const absent = new Map<string, number>();
let liveHeld: { ids: MarketId[]; gotMs: number } | null = null;
let boardFlight: Promise<boolean> | null = null;
let okAtMs = 0;
let offUntilMs = 0;
const queue = new Map<string, ((entry: BoardEntry | null) => void)[]>();
let flushQueued = false;

const base = () => marketsEnv().opsUrl?.replace(/\/+$/, "") ?? null;
const usable = (now: number) => base() !== null && now >= offUntilMs;
/** Ops' read time against the chain-corrected clock: a stuck board ages out and the chain takes over. */
const fresh = (e: BoardEntry) => nowMs() - e.atMs <= BOARD_STALE_MS;

/** Ops' board answered within the last minute: a stream frame then refreshes from it (`stream/dispatch.ts`). */
export function boardLive(now: number = Date.now()): boolean {
  return okAtMs > 0 && now - okAtMs < 60_000 && now >= offUntilMs;
}

async function get(path: string): Promise<BoardWire> {
  const res = await fetch(`${base()}${path}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ops ${path.split("?")[0]} answered ${res.status}`);
  const board = decodeBoard(await res.text());
  if (!board) throw new Error("ops board unreadable (another build?)");
  return board;
}

function take(board: BoardWire): void {
  const now = Date.now();
  okAtMs = now;
  for (const [id, entry] of Object.entries(board.windows)) held.set(id.toLowerCase(), { entry, gotMs: now });
  if (held.size > 1_000) for (const [id, h] of held) if (now - h.gotMs > 60_000) held.delete(id);
}

function off(): void {
  offUntilMs = Date.now() + BACKOFF_MS;
}

/** The live board's Windows (open, before lock, soonest expiry first), or null for the chain. */
export async function boardLiveWindows(): Promise<BoardEntry[] | null> {
  if (!usable(Date.now())) return null;
  if (!liveHeld || Date.now() - liveHeld.gotMs > REUSE_MS) {
    boardFlight ??= get("/v1/board")
      .then((b) => {
        if (nowMs() - b.asOfMs > BOARD_STALE_MS) throw new Error("ops board is stale");
        take(b);
        liveHeld = { ids: b.live ?? [], gotMs: Date.now() };
        return true;
      })
      .catch(() => (off(), false))
      .finally(() => (boardFlight = null));
    if (!(await boardFlight) || !liveHeld) return null;
  }
  const entries = liveHeld.ids.map((id) => held.get(id.toLowerCase())?.entry);
  return entries.every((e): e is BoardEntry => e !== undefined && fresh(e)) ? entries : null;
}

/** The board's fresh entries for `ids` (keyed as asked); an id it doesn't hold fresh is absent — read it from the chain. */
export async function boardEntries(ids: readonly MarketId[]): Promise<Map<MarketId, BoardEntry>> {
  const out = new Map<MarketId, BoardEntry>();
  const now = Date.now();
  if (ids.length === 0 || !usable(now)) return out;
  const waits: Promise<void>[] = [];
  for (const id of ids) {
    const key = id.toLowerCase();
    const h = held.get(key);
    if (h && now - h.gotMs <= REUSE_MS) {
      if (fresh(h.entry)) out.set(id, h.entry);
      continue;
    }
    if ((absent.get(key) ?? 0) > now) continue;
    waits.push(
      new Promise<void>((resolve) => {
        const list = queue.get(key) ?? [];
        list.push((entry) => {
          if (entry && fresh(entry)) out.set(id, entry);
          resolve();
        });
        queue.set(key, list);
      }),
    );
  }
  if (waits.length > 0 && !flushQueued) {
    flushQueued = true;
    setTimeout(() => void flush(), 0);
  }
  await Promise.all(waits);
  return out;
}

async function flush(): Promise<void> {
  flushQueued = false;
  const batch = new Map(queue);
  queue.clear();
  const ids = [...batch.keys()];
  const answer = (key: string, entry: BoardEntry | null) => batch.get(key)?.forEach((r) => r(entry));
  try {
    const chunks = Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ids.slice(i * CHUNK, (i + 1) * CHUNK));
    const boards = await Promise.all(chunks.map((c) => get(`/v1/windows?ids=${c.join(",")}`)));
    for (const b of boards) take(b);
    const got = new Set(boards.flatMap((b) => Object.keys(b.windows).map((k) => k.toLowerCase())));
    const until = Date.now() + ABSENT_MS;
    for (const key of ids) {
      const entry = got.has(key) ? (held.get(key)?.entry ?? null) : null;
      if (!entry) absent.set(key, until);
      answer(key, entry);
    }
    if (absent.size > 2_000) for (const [k, t] of absent) if (t < Date.now()) absent.delete(k);
  } catch {
    off();
    for (const key of ids) answer(key, null);
  }
}

/** Tests: forget everything this tab learned. */
export function resetBoardReads(): void {
  held.clear();
  absent.clear();
  queue.clear();
  liveHeld = null;
  boardFlight = null;
  okAtMs = 0;
  offUntilMs = 0;
  flushQueued = false;
}
