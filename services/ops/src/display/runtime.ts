/**
 * The display feed's process wiring (S23a, D-196): the crypto feed (Coinbase socket → five-venue median), the stocks'
 * Alpaca IEX trades when ops holds `ALPACA_KEY_ID`/`ALPACA_SECRET_KEY`, RedStone behind both; published on `ticks`
 * (coalesced, ephemeral), kept for half an hour in the recent ring, and the chart's candles and day figures read on
 * demand. Every heartbeat here is non-critical: an exchange outage never fails `/health`.
 */
import { TICKER_SYMBOLS } from "@cwf/core";
import type { Sql } from "@cwf/db";
import type { SessionService } from "../calendar/session-service";
import type { SpotFeed } from "../prices/spot";
import type { Bus } from "../runtime/bus";
import { alpacaKeys, createAlpacaDisplayFeed } from "./alpaca-trades";
import { createChartCandles, type ChartCandles } from "./chart-candles";
import { createCryptoDisplayFeed } from "./crypto-spot";
import { createDayStats, type DayStatsReader } from "./day-stats";
import { createDisplayFeed } from "./feed";
import { publishTicks, wireDisplay } from "./publish";
import { createRecentRing, type RecentRing } from "./recent-ring";
import type { DisplayFeed } from "./types";

export interface DisplayRuntime {
  feed: DisplayFeed;
  recent: RecentRing;
  candles: ChartCandles;
  day: DayStatsReader;
  /** Every ticker's newest display quote, for a `ticks` subscriber's first frames. */
  snapshot(): Array<{ event: string; data: unknown }>;
  /** Whether stocks read Alpaca (keys present) or RedStone only. */
  stocksSource: "alpaca" | "redstone";
}

export function startDisplay(input: { spot: SpotFeed | null; sessions: SessionService; bus: Bus; sql: Sql | null; log: (why: string) => void; env?: NodeJS.ProcessEnv }): DisplayRuntime {
  const keys = alpacaKeys(input.env ?? process.env);
  const sessionState = (nowSec: number) => input.sessions.status(nowSec)?.state ?? null;
  const feed = createDisplayFeed({
    crypto: createCryptoDisplayFeed({ log: input.log }),
    stocks: keys ? createAlpacaDisplayFeed({ keys, log: input.log, sessionState }) : null,
    spot: input.spot,
    sessionState,
  });
  const recent = createRecentRing(feed);
  publishTicks(feed, input.bus);
  feed.start();
  if (!keys) input.log("no ALPACA_KEY_ID/ALPACA_SECRET_KEY: stocks draw RedStone's 10 s values and its archive's candles");
  return {
    feed,
    recent,
    candles: createChartCandles({ alpaca: keys, sql: input.sql }),
    day: createDayStats({ alpaca: keys, sql: input.sql }),
    snapshot: () => TICKER_SYMBOLS.flatMap((s) => {
      const q = feed.latest(s);
      return q ? [{ event: "tick", data: wireDisplay(q) }] : [];
    }),
    stocksSource: keys ? "alpaca" : "redstone",
  };
}
