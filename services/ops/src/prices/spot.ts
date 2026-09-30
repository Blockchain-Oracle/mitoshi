// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/prices/{spot,spot-feed}.ts — the Hermes
// stream and Jupiter xStock quotes become RedStone `latest` (every 10 s, all feeds in one fetch) and, on mainnet with
// credentials, Data Streams `reports/latest` (Q-011).
/**
 * The process's spot feed (plan C.5.2 spot/stream): integers × 10⁸ per symbol — a ticker's session feed (`TSLA`,
 * `BTC`) and a stock's 24/7 feed under `<T>-24` (`TSLA---24_7`). Consumers: the seed maker, halt-watch (package ages),
 * `/prices/latest`, the stream's `prices` / `symbol:<T>` topics and `price_ticks` (30-day retention).
 */
import { REDSTONE_STALE_SEC, REDSTONE_TICKERS, TICKERS, type TickerSymbol } from "@cwf/core";
import { latestMedian } from "@cwf/markets/ops";
import { errorText } from "../runtime/env";
import { registerHeartbeat } from "../runtime/heartbeat";
import { fetchRedstoneLatest, type RedstoneSources } from "./redstone-gateway";

export type SpotSymbol = TickerSymbol | `${TickerSymbol}-24`;

export interface SpotQuote {
  symbol: SpotSymbol;
  priceE8: bigint;
  /** The source's own publish time. */
  publishTimeSec: number;
  /** Distinct configured signers behind the value (RedStone); 1 for a Data Streams report. */
  signers: number;
  source: "redstone" | "datastreams";
}

export interface SpotFeed {
  /** The latest quote no older than `maxAgeSec` (default 30), or null. */
  latest(symbol: SpotSymbol, maxAgeSec?: number): SpotQuote | null;
  /** The newest quote whatever its age (for display fallbacks and halt ages). */
  newest(symbol: SpotSymbol): SpotQuote | null;
  /** The newest quote at or before `sec`, no older than `windowSec` before it (the maker's start sample). */
  at(symbol: SpotSymbol, sec: number, windowSec: number): SpotQuote | null;
  subscribe(listener: (quote: SpotQuote) => void): () => void;
  symbols(): SpotSymbol[];
  /** Wall time (unix s) of the last RedStone `latest` read that answered with feeds; null before the first. */
  lastReadSec(): number | null;
}

export interface SpotFeedHandle extends SpotFeed {
  start(): void;
  stop(): void;
}

export const SPOT_EVERY_MS = 10_000;
const DEFAULT_MAX_AGE_SEC = 30;
/** Per-symbol history kept in memory for `at()` (the longest in-memory need is a 60-minute Window's start). */
const HISTORY_SEC = 2 * 3_600;

/** The RedStone feeds the spot follows: each ticker's feed and each stock's 24/7 feed. */
export function spotFeeds(): Array<{ symbol: SpotSymbol; feed: string }> {
  return REDSTONE_TICKERS.flatMap((s) => {
    const t = TICKERS[s];
    return [
      ...(t.redstoneFeedId ? [{ symbol: s as SpotSymbol, feed: t.redstoneFeedId }] : []),
      ...(t.redstone24x7FeedId ? [{ symbol: `${s}-24` as SpotSymbol, feed: t.redstone24x7FeedId }] : []),
    ];
  });
}

export function createSpotFeed(input: { sources: RedstoneSources; log: (why: string) => void; everyMs?: number }): SpotFeedHandle {
  const history = new Map<SpotSymbol, SpotQuote[]>();
  const listeners = new Set<(q: SpotQuote) => void>();
  const beat = registerHeartbeat("spot-feed", false, input.everyMs ?? SPOT_EVERY_MS);
  const feeds = spotFeeds();
  let timer: NodeJS.Timeout | null = null;
  let lastReadSec: number | null = null;

  const emit = (q: SpotQuote) => {
    const list = history.get(q.symbol) ?? [];
    const last = list.at(-1);
    if (last && last.publishTimeSec >= q.publishTimeSec) return;
    list.push(q);
    while (list.length && list[0]!.publishTimeSec < q.publishTimeSec - HISTORY_SEC) list.shift();
    history.set(q.symbol, list);
    for (const l of listeners) l(q);
  };

  const poll = async () => {
    beat.passStartedMs = Date.now();
    try {
      const { text } = await fetchRedstoneLatest(input.sources.gateways);
      let seen = 0;
      let newestSec = 0;
      for (const { symbol, feed } of feeds) {
        const m = latestMedian(text, feed, input.sources.signers);
        if (!m) continue;
        seen++;
        newestSec = Math.max(newestSec, m.publishTimeSec);
        emit({ symbol, priceE8: m.priceE8, publishTimeSec: m.publishTimeSec, signers: m.signers, source: "redstone" });
      }
      const nowSec = Math.floor(Date.now() / 1000);
      if (seen === 0) throw new Error("redstone latest carried none of our feeds");
      // Every feed old at once is a stale answer (or our clock), not RedStone stopping each feed: a failed read (D-186).
      if (nowSec - newestSec > REDSTONE_STALE_SEC) throw new Error(`redstone latest is stale: its newest package is ${nowSec - newestSec} s old`);
      lastReadSec = nowSec;
      beat.lastOkMs = Date.now();
      beat.failures = 0;
      beat.lastWhy = `redstone latest: ${seen}/${feeds.length} feeds`;
      beat.detail = { feeds: seen, of: feeds.length };
    } catch (error) {
      beat.failures += 1;
      beat.lastWhy = `redstone latest failed: ${errorText(error)}`;
      if (beat.failures === 1 || beat.failures % 30 === 0) input.log(beat.lastWhy);
    } finally {
      beat.lastPassMs = Date.now();
      beat.passStartedMs = null;
    }
  };

  const newest = (symbol: SpotSymbol) => history.get(symbol)?.at(-1) ?? null;
  return {
    latest(symbol, maxAgeSec = DEFAULT_MAX_AGE_SEC) {
      const q = newest(symbol);
      return q && Date.now() / 1000 - q.publishTimeSec <= maxAgeSec ? q : null;
    },
    newest,
    at(symbol, sec, windowSec) {
      const list = history.get(symbol) ?? [];
      for (let i = list.length - 1; i >= 0; i--) {
        const q = list[i]!;
        if (q.publishTimeSec <= sec) return q.publishTimeSec >= sec - windowSec ? q : null;
      }
      return null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    symbols: () => [...history.keys()],
    lastReadSec: () => lastReadSec,
    start() {
      if (timer) return;
      void poll();
      timer = setInterval(() => void poll(), input.everyMs ?? SPOT_EVERY_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
