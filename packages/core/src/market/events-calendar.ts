// Ported from Agari 03b30ab:packages/core/src/market/events-calendar.ts
import { z } from "zod";
import type { LaneBasis } from "../types/market";
import type { EarningsEvent, EarningsFlag, EarningsHour } from "../types/session-lanes";
import { addDays, etDateOf } from "./et-time";
import { TICKER_SYMBOLS, TICKERS, type TickerSymbol } from "./tickers";

/**
 * Earnings flags (session-lanes.md §3.3, D-057): ops reads Finnhub's calendar, this decides which Windows sit on a
 * report. A flag is a warning line (L-32) and `/session.earnings`, never a blocker; tighter caps are an S10 flag only.
 */

/** Ops reads this far ahead. */
export const EARNINGS_LOOKAHEAD_DAYS = 14;

/** ETFs never report: only the registry's stocks are asked for. */
export const EARNINGS_SYMBOLS: readonly TickerSymbol[] = TICKER_SYMBOLS.filter((symbol) => TICKERS[symbol].kind === "stock");

/** `from`/`to` ET dates for a read at `nowSec`: today through the lookahead. */
export function earningsRange(nowSec: number, days = EARNINGS_LOOKAHEAD_DAYS): { from: string; to: string } {
  const from = etDateOf(nowSec);
  return { from, to: addDays(from, days) };
}

/** The span a flag needs: `tradingStartSec`'s ET date is a Gap's Friday, `expirySec`'s its Monday. */
export interface FlagWindow {
  lane: LaneBasis;
  tradingStartSec: number;
  expirySec: number;
}

/**
 * The report a Window sits on, with its flag:
 * - `earnings-session`: a Regular Window whose start is on a report date (any hour);
 * - `earnings-gap`: a Gap whose Friday (the last close before the weekend) carries an `amc` report or whose Monday
 *   (the first open after it) carries a `bmo` one. A report with no hour, or `dmh`, doesn't move the Gap's prints.
 * Token Windows carry no flag.
 */
export function earningsEventFor(symbol: TickerSymbol, window: FlagWindow, events: readonly EarningsEvent[]): { flag: EarningsFlag; event: EarningsEvent } | null {
  const mine = events.filter((e) => e.symbol === symbol);
  if (window.lane === "regular") {
    const date = etDateOf(window.tradingStartSec);
    const event = mine.find((e) => e.dateEt === date);
    return event ? { flag: "earnings-session", event } : null;
  }
  if (window.lane === "gap") {
    const [friday, monday] = [etDateOf(window.tradingStartSec), etDateOf(window.expirySec)];
    const event = mine.find((e) => (e.dateEt === friday && e.hour === "amc") || (e.dateEt === monday && e.hour === "bmo"));
    return event ? { flag: "earnings-gap", event } : null;
  }
  return null;
}

export function earningsFlag(symbol: TickerSymbol, window: FlagWindow, events: readonly EarningsEvent[]): EarningsFlag | null {
  return earningsEventFor(symbol, window, events)?.flag ?? null;
}

const HOURS: readonly string[] = ["bmo", "amc", "dmh"] satisfies EarningsHour[];

const rowSchema = z.object({ symbol: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hour: z.string().nullish() });
const bodySchema = z.object({ earningsCalendar: z.array(z.unknown()) });

/**
 * Finnhub `/calendar/earnings` → events for `symbols`, soonest first, one per (symbol, date). A malformed row is
 * dropped; a malformed body is `null` (unknown), which a reader must never show as "no earnings".
 */
export function parseFinnhubEarnings(body: unknown, symbols: readonly TickerSymbol[]): EarningsEvent[] | null {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return null;
  const wanted = new Set<string>(symbols);
  const byKey = new Map<string, EarningsEvent>();
  for (const raw of parsed.data.earningsCalendar) {
    const row = rowSchema.safeParse(raw);
    if (!row.success || !wanted.has(row.data.symbol)) continue;
    const hour = HOURS.includes(row.data.hour ?? "") ? (row.data.hour as EarningsHour) : null;
    const event: EarningsEvent = { symbol: row.data.symbol as TickerSymbol, dateEt: row.data.date, hour };
    const key = `${event.symbol}:${event.dateEt}`;
    // Finnhub can list a date twice while an estimate is revised; a known hour beats an unknown one.
    if (!byKey.has(key) || (byKey.get(key)!.hour === null && hour !== null)) byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => a.dateEt.localeCompare(b.dateEt) || a.symbol.localeCompare(b.symbol));
}
