/**
 * The terminal's live line (S23b, D-196): the ops `ticks` topic — every ticker's display price (Coinbase, the venues'
 * median, Bitstamp, Alpaca IEX, RedStone behind them), coalesced to ≤ 8 a second each — held per symbol outside React:
 * the newest tick, the last half hour as a ring seeded from `/prices/recent`, and whether the line is stale. The chart
 * reads it every frame; React commits from it at ≤ 5 Hz (`useCommittedSpot`). Never the `prices` topic or the query
 * cache, and never a settling value: Windows settle on the signed print (`prices`). Framework-free and light (no viem),
 * exported as `@cwf/markets/live-ticks`.
 */
import { streamState, subscribeTopic, type StreamEvent } from "./stream-hub";

export const TICKS_TOPIC = "ticks";
export type TickSource = "coinbase" | "venues" | "bitstamp" | "alpaca" | "redstone";

export interface LiveTick {
  symbol: string;
  priceE8: bigint;
  /** The trade's (or signed value's) own time. */
  atMs: number;
  source: TickSource;
}

/** Kept per symbol for the chart's back-fill and the replay. */
export const RING_SPAN_MS = 30 * 60_000;
/** A fast source quiet this long, or RedStone (10 s cadence) this long, reads as stale ("reconnecting"). */
export const STALE_FAST_MS = 20_000;
export const STALE_SIGNED_MS = 45_000;
/** A route change unmounts and remounts every consumer; the topic outlives that gap instead of reconnecting. */
const LINGER_MS = 5_000;

interface Ring {
  t: number[];
  p: number[];
}

let opsUrl: string | null = null;
const latest = new Map<string, LiveTick>();
const rings = new Map<string, Ring>();
const listeners = new Map<string, Set<() => void>>();
const seeded = new Set<string>();
let offTopic: (() => void) | null = null;
let lingerTimer: ReturnType<typeof setTimeout> | null = null;

/** Where `/prices/recent` lives (the ops base URL); null leaves a fresh tab's line to start from its first tick. */
export function configureLiveTicks(next: { opsUrl: string | null }): void {
  opsUrl = next.opsUrl ? next.opsUrl.replace(/\/+$/, "") : null;
}

const SOURCES = new Set<string>(["coinbase", "venues", "bitstamp", "alpaca", "redstone"]);

/** A `tick` event's data (services/ops `wireDisplay`) → a tick, or null for anything malformed. */
export function parseTick(data: unknown): LiveTick | null {
  const d = data as { symbol?: unknown; priceE8?: unknown; atMs?: unknown; source?: unknown };
  if (typeof d?.symbol !== "string" || typeof d.priceE8 !== "string" || !/^\d{1,30}$/.test(d.priceE8) || typeof d.atMs !== "number" || !Number.isFinite(d.atMs)) return null;
  const priceE8 = BigInt(d.priceE8);
  if (priceE8 <= 0n) return null;
  return { symbol: d.symbol, priceE8, atMs: d.atMs, source: (typeof d.source === "string" && SOURCES.has(d.source) ? d.source : "redstone") as TickSource };
}

function ringOf(symbol: string): Ring {
  let ring = rings.get(symbol);
  if (!ring) rings.set(symbol, (ring = { t: [], p: [] }));
  return ring;
}

function trim(ring: Ring, nowMs: number): void {
  let drop = 0;
  while (drop < ring.t.length && ring.t[drop]! < nowMs - RING_SPAN_MS) drop++;
  if (drop > 0) {
    ring.t.splice(0, drop);
    ring.p.splice(0, drop);
  }
}

/** Records a tick; false when it is older than (or the same as) what the symbol already shows. */
export function recordTick(tick: LiveTick): boolean {
  const prev = latest.get(tick.symbol);
  if (prev && (tick.atMs < prev.atMs || (tick.atMs === prev.atMs && tick.priceE8 === prev.priceE8))) return false;
  latest.set(tick.symbol, tick);
  const ring = ringOf(tick.symbol);
  const price = Number(tick.priceE8) / 1e8;
  if (ring.t.at(-1) === tick.atMs) ring.p[ring.p.length - 1] = price;
  else {
    ring.t.push(tick.atMs);
    ring.p.push(price);
  }
  trim(ring, tick.atMs);
  return true;
}

function notify(symbol: string): void {
  for (const l of listeners.get(symbol) ?? []) l();
}

function onBatch(events: StreamEvent[]): void {
  const moved = new Set<string>();
  for (const e of events) {
    if (e.event !== "tick") continue;
    const tick = parseTick(e.data);
    if (tick && recordTick(tick)) moved.add(tick.symbol);
  }
  for (const s of moved) notify(s);
}

/** Merges `/prices/recent` behind what the stream already delivered (the stream wins on overlap). */
export function mergeRecent(symbol: string, points: ReadonlyArray<readonly [number, string]>): void {
  const ring = ringOf(symbol);
  const first = ring.t[0] ?? Number.POSITIVE_INFINITY;
  const older = points.filter(([t, p]) => t < first && /^\d{1,30}$/.test(p));
  if (older.length === 0) return;
  ring.t.unshift(...older.map(([t]) => t));
  ring.p.unshift(...older.map(([, p]) => Number(BigInt(p)) / 1e8));
  if (!latest.has(symbol)) {
    const [t, p] = older.at(-1)!;
    latest.set(symbol, { symbol, priceE8: BigInt(p), atMs: t, source: "redstone" });
  }
  trim(ring, ring.t.at(-1)!);
}

async function seed(symbol: string, fetcher: typeof fetch): Promise<void> {
  if (seeded.has(symbol) || !opsUrl) return;
  seeded.add(symbol);
  try {
    const res = await fetcher(`${opsUrl}/prices/recent?symbol=${encodeURIComponent(symbol)}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { points?: Array<[number, string]> };
    mergeRecent(symbol, body.points ?? []);
    notify(symbol);
  } catch {
    seeded.delete(symbol); // the next subscriber tries again
  }
}

/**
 * Listens to one symbol's line; the `ticks` topic opens with the first listener and closes a moment after the last.
 * `seed: false` skips the half-hour back-fill (a list of prices needs the newest tick, not the chart's past).
 */
export function subscribeLiveTick(symbol: string, listener: () => void, { seed: seedRing = true, fetcher = fetch }: { seed?: boolean; fetcher?: typeof fetch } = {}): () => void {
  let set = listeners.get(symbol);
  if (!set) listeners.set(symbol, (set = new Set()));
  set.add(listener);
  if (lingerTimer) clearTimeout(lingerTimer);
  lingerTimer = null;
  offTopic ??= subscribeTopic(TICKS_TOPIC, onBatch);
  if (seedRing) void seed(symbol, fetcher);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(symbol);
    if (listeners.size > 0) return;
    lingerTimer ??= setTimeout(() => {
      lingerTimer = null;
      if (listeners.size > 0 || !offTopic) return;
      offTopic();
      offTopic = null;
    }, LINGER_MS);
  };
}

export function liveTick(symbol: string): LiveTick | null {
  return latest.get(symbol) ?? null;
}

/** The symbol's last half hour: parallel arrays of ms and prices (numbers, display only), oldest first. */
export function liveRing(symbol: string): Readonly<Ring> {
  return rings.get(symbol) ?? { t: [], p: [] };
}

/** Stale: no tick, the stream not open, or the newest tick older than its source's cadence allows. */
export function tickStale(symbol: string, nowMs: number): boolean {
  const tick = latest.get(symbol);
  if (!tick || streamState() !== "open") return true;
  return nowMs - tick.atMs > (tick.source === "redstone" ? STALE_SIGNED_MS : STALE_FAST_MS);
}

/** Test seam: forget every tick, ring and seed. */
export function resetLiveTicks(): void {
  latest.clear();
  rings.clear();
  seeded.clear();
}
