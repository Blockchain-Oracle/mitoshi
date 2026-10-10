// Ported from Agari 03b30ab:packages/core/src/market/events-calendar.ts (its Finnhub half, split out in S6 so the
// earnings rules carry no zod onto the terminal, as F-S23-08 split Alpaca's calendar rows). Ops' `earnings` actor reads it.
import { z } from "zod";
import type { EarningsEvent, EarningsHour } from "../types/session-lanes";
import type { TickerSymbol } from "./tickers";

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
