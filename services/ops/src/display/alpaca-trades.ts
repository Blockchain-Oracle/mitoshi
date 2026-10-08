/**
 * The stocks' display spot (S23a, D-196): the last IEX trade of every ticker Alpaca prices, read from
 * `/v2/stocks/trades/latest` every `EVERY_MS` while the US market is in a session (04:00–20:00 ET: pre, regular,
 * post). IEX is a slice of the tape, so a print can differ from RedStone's consolidated value by a few bps — the
 * terminal marks the latest signed value beside the line. Outside those hours nothing is read; the display feed falls
 * back to RedStone. Display only: nothing settles on it. The data host is Alpaca's market-data API
 * (`data.alpaca.markets/v2`, overridable by `ALPACA_DATA_URL`), not the trading API `ALPACA_ENDPOINT` names.
 */
import { STOCK_SYMBOLS, TICKERS, type SessionState, type StockSymbol } from "@cwf/core";
import { errorText } from "../runtime/env";
import { registerHeartbeat } from "../runtime/heartbeat";
import { displayE8, type DisplayFeedHandle, type DisplayQuote, type Fetch } from "./types";

export interface AlpacaKeys {
  keyId: string;
  secretKey: string;
  dataUrl?: string;
}

const DATA_URL = "https://data.alpaca.markets/v2";
/** ≈ 40 requests a minute for every ticker at once — well inside the free plan's 200. */
const EVERY_MS = 1_500;
const IN_SESSION: readonly SessionState[] = ["pre", "regular", "early-close", "post", "halted"];

export function alpacaKeys(env: NodeJS.ProcessEnv): AlpacaKeys | null {
  const keyId = env.ALPACA_KEY_ID?.trim();
  const secretKey = env.ALPACA_SECRET_KEY?.trim();
  if (!keyId || !secretKey) return null;
  return { keyId, secretKey, ...(env.ALPACA_DATA_URL?.trim() ? { dataUrl: env.ALPACA_DATA_URL.trim() } : {}) };
}

export const alpacaHeaders = (keys: AlpacaKeys) => ({ "APCA-API-KEY-ID": keys.keyId, "APCA-API-SECRET-KEY": keys.secretKey, "user-agent": "mitoshi-display-spot" });
export const alpacaBase = (keys: AlpacaKeys) => (keys.dataUrl ?? DATA_URL).replace(/\/+$/, "");

/** The stocks Alpaca prices (its symbol per ticker). */
export const ALPACA_STOCKS: readonly StockSymbol[] = STOCK_SYMBOLS.filter((s) => TICKERS[s].alpacaSymbol !== null);

/** `{ trades: { TSLA: { t, p } } }` → one quote per ticker that came back with a positive price. */
export function parseLatestTrades(text: string, symbols: readonly StockSymbol[]): DisplayQuote[] {
  const body = JSON.parse(text) as { trades?: Record<string, { t?: string; p?: number } | null>; message?: string };
  if (!body.trades) throw new Error(`alpaca trades: ${body.message ?? text.slice(0, 120)}`);
  const out: DisplayQuote[] = [];
  for (const symbol of symbols) {
    const trade = body.trades[TICKERS[symbol].alpacaSymbol ?? ""];
    const priceE8 = displayE8(trade?.p);
    const atMs = trade?.t ? Date.parse(trade.t) : Number.NaN;
    if (priceE8 && Number.isFinite(atMs)) out.push({ symbol, priceE8, atMs, source: "alpaca" });
  }
  return out;
}

export function createAlpacaDisplayFeed(input: {
  keys: AlpacaKeys;
  log: (why: string) => void;
  /** The market's state now (the session service); null before the calendar is known → no read. */
  sessionState: (nowSec: number) => SessionState | null;
  fetchImpl?: Fetch;
  everyMs?: number;
}): DisplayFeedHandle {
  const fetchImpl = input.fetchImpl ?? (fetch as Fetch);
  const quotes = new Map<string, DisplayQuote>();
  const listeners = new Set<(q: DisplayQuote) => void>();
  const beat = registerHeartbeat("display-stocks", false, input.everyMs ?? EVERY_MS, false);
  const url = `${alpacaBase(input.keys)}/stocks/trades/latest?symbols=${ALPACA_STOCKS.map((s) => TICKERS[s].alpacaSymbol).join(",")}&feed=iex`;
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  let lastError = "";

  const tick = async () => {
    if (busy) return;
    const state = input.sessionState(Math.floor(Date.now() / 1000));
    beat.lastPassMs = Date.now();
    if (!state || !IN_SESSION.includes(state)) {
      beat.lastOkMs = Date.now();
      beat.failures = 0;
      beat.lastWhy = `market ${state ?? "unknown"} — RedStone carries the stocks' line`;
      return;
    }
    busy = true;
    try {
      const r = await fetchImpl(url, { headers: alpacaHeaders(input.keys), signal: AbortSignal.timeout(4_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      for (const q of parseLatestTrades(await r.text(), ALPACA_STOCKS)) {
        const prev = quotes.get(q.symbol);
        if (prev && prev.atMs >= q.atMs) continue;
        quotes.set(q.symbol, q);
        for (const l of listeners) l(q);
      }
      beat.lastOkMs = Date.now();
      beat.failures = 0;
      beat.lastWhy = `${state}: ${quotes.size} ticker(s) on IEX`;
      lastError = "";
    } catch (error) {
      beat.failures += 1;
      const why = errorText(error);
      if (why !== lastError) input.log(`display stocks: ${why}`);
      lastError = why;
      beat.lastWhy = `alpaca: ${why}`;
    } finally {
      busy = false;
    }
  };

  return {
    start() {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), input.everyMs ?? EVERY_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    latest: (symbol) => quotes.get(symbol) ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
