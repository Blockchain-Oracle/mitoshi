// Ported from Owarine ecb7565b:services/ops/src/prices/crypto-spot.ts — the crypto display spot: the last trade of each
// crypto symbol on Coinbase Exchange's public WebSocket `ticker` channel, and for a symbol the socket has said nothing
// about for `WS_QUIET_MS` the five-venue REST median (`crypto-rest.ts`), at most every `REST_EVERY_MS`. Changed: the
// display types (`atMs`, `coinbase`/`venues` sources), SOL with BTC and ETH, a non-critical heartbeat (an exchange
// outage never fails `/health`), no join into the settlement feed (D-196).
import { CRYPTO_SYMBOLS, type CryptoSymbol } from "@cwf/core";
import { errorText } from "../runtime/env";
import { registerHeartbeat } from "../runtime/heartbeat";
import { readCryptoMedian } from "./crypto-rest";
import { displayE8, type DisplayFeedHandle, type DisplayQuote, type Fetch } from "./types";

/** The slice of a WebSocket the feed uses (Node's global `WebSocket`, or a fake in tests). */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

const EVERY_MS = 2_000;
export const COINBASE_WS_URL = "wss://ws-feed.exchange.coinbase.com";
/** A symbol whose last socket trade is older than this is read over REST until the socket speaks again. */
export const WS_QUIET_MS = 5_000;
/** The five-venue REST read runs at most this often (Bitfinex allows about 30 ticker calls a minute). */
const REST_EVERY_MS = 3_000;
const WS_RETRY_MIN_MS = 1_000;
const WS_RETRY_MAX_MS = 30_000;

/** One `ticker` message → the trade it reports, or null for anything else (subscriptions, heartbeats, other products). */
export function parseCoinbaseTicker(raw: string, symbols: readonly string[]): { symbol: CryptoSymbol; priceE8: bigint; timeMs: number } | null {
  let body: { type?: unknown; product_id?: unknown; price?: unknown; time?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return null;
  }
  if (body.type !== "ticker" || typeof body.product_id !== "string" || typeof body.price !== "string") return null;
  const symbol = body.product_id.endsWith("-USD") ? body.product_id.slice(0, -4) : null;
  if (!symbol || !symbols.includes(symbol)) return null;
  const priceE8 = displayE8(body.price);
  if (!priceE8) return null;
  const timeMs = typeof body.time === "string" ? Date.parse(body.time) : Number.NaN;
  return { symbol: symbol as CryptoSymbol, priceE8, timeMs: Number.isFinite(timeMs) ? timeMs : Date.now() };
}

const defaultSocket: SocketFactory | null = typeof globalThis.WebSocket === "function" ? (url) => new globalThis.WebSocket(url) as unknown as SocketLike : null;

export function createCryptoDisplayFeed(input: {
  log: (why: string) => void;
  symbols?: readonly CryptoSymbol[];
  fetchImpl?: Fetch;
  everyMs?: number;
  /** Null turns the socket off (REST only); absent uses Node's global `WebSocket`. */
  socket?: SocketFactory | null;
}): DisplayFeedHandle {
  const symbols = input.symbols ?? CRYPTO_SYMBOLS;
  const fetchImpl = input.fetchImpl ?? (fetch as Fetch);
  const makeSocket = input.socket === undefined ? defaultSocket : input.socket;
  const quotes = new Map<string, DisplayQuote>();
  /** Wall time of each symbol's last socket trade. */
  const heardMs = new Map<string, number>();
  const listeners = new Set<(q: DisplayQuote) => void>();
  const beat = registerHeartbeat("display-crypto", false, input.everyMs ?? EVERY_MS, false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let socket: SocketLike | null = null;
  let socketRetry: ReturnType<typeof setTimeout> | null = null;
  let socketRetryMs = WS_RETRY_MIN_MS;
  let running = false;
  let lastError = "";

  const publish = (quote: DisplayQuote) => {
    const prev = quotes.get(quote.symbol);
    if (prev && prev.atMs > quote.atMs) return;
    quotes.set(quote.symbol, quote);
    if (!prev || prev.priceE8 !== quote.priceE8 || prev.atMs !== quote.atMs) for (const l of listeners) l(quote);
  };

  let lastRestMs = 0;
  let venuesLine = "";
  const tick = async () => {
    const nowMs = Date.now();
    const quiet = symbols.filter((s) => nowMs - (heardMs.get(s) ?? 0) >= WS_QUIET_MS);
    let failed: string[] = [];
    if (quiet.length > 0 && nowMs - lastRestMs >= REST_EVERY_MS) {
      lastRestMs = nowMs;
      const r = await readCryptoMedian(quiet, fetchImpl, nowMs);
      for (const [symbol, { trade }] of r.bySymbol) publish({ symbol, priceE8: trade.priceE8, atMs: trade.timeMs, source: "venues" });
      failed = quiet.filter((s) => !r.bySymbol.has(s));
      venuesLine = ` · REST median of ${[...r.bySymbol.values()].map((v) => v.venues).join("/") || 0} venue(s)${r.failed.length ? `, down: ${r.failed.join(", ")}` : ""}`;
    } else if (quiet.length === 0) venuesLine = "";
    beat.lastPassMs = Date.now();
    if (failed.length === 0) {
      beat.lastOkMs = Date.now();
      beat.failures = 0;
    } else {
      beat.failures += 1;
      const why = `no venue answered for ${failed.join(", ")}`;
      if (why !== lastError) input.log(`display crypto: ${why}`);
      lastError = why;
    }
    beat.lastWhy = `${[...quotes.values()].map((q) => `${q.symbol} ${q.priceE8}`).join(", ") || "no quote yet"} · socket ${symbols.length - quiet.length}/${symbols.length}${venuesLine}`;
  };

  const openSocket = () => {
    if (!running || !makeSocket || socket) return;
    let ws: SocketLike;
    try {
      ws = makeSocket(COINBASE_WS_URL);
    } catch (error) {
      input.log(`display crypto socket: ${errorText(error)}`);
      return scheduleSocket();
    }
    socket = ws;
    ws.onopen = () => {
      socketRetryMs = WS_RETRY_MIN_MS;
      ws.send(JSON.stringify({ type: "subscribe", product_ids: symbols.map((s) => `${s}-USD`), channels: ["ticker"] }));
      input.log(`display crypto socket open: ${symbols.join(", ")}`);
    };
    ws.onmessage = (event) => {
      const trade = typeof event.data === "string" ? parseCoinbaseTicker(event.data, symbols) : null;
      if (!trade) return;
      heardMs.set(trade.symbol, Date.now());
      publish({ symbol: trade.symbol, priceE8: trade.priceE8, atMs: trade.timeMs, source: "coinbase" });
    };
    ws.onerror = () => undefined;
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      scheduleSocket();
    };
  };

  const scheduleSocket = () => {
    if (!running || socketRetry) return;
    socketRetry = setTimeout(() => {
      socketRetry = null;
      openSocket();
    }, socketRetryMs);
    socketRetryMs = Math.min(socketRetryMs * 2, WS_RETRY_MAX_MS);
  };

  return {
    start() {
      if (running) return;
      running = true;
      openSocket();
      void tick();
      timer = setInterval(() => void tick(), input.everyMs ?? EVERY_MS);
    },
    stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
      if (socketRetry) clearTimeout(socketRetry);
      socketRetry = null;
      const ws = socket;
      socket = null;
      ws?.close();
    },
    latest: (symbol) => quotes.get(symbol) ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
