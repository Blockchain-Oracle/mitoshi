"use client";
/**
 * The next report for one stock, from the session store ops already feeds (`/session.earnings`, Finnhub's calendar
 * read every 6 h) — no second read, as Owarine's `useNextEarnings` reads `/api/earnings` once. "Tue, Oct 21 · after
 * close" from an ET calendar date; noon UTC keeps the weekday right in every zone.
 */
import { etDateOf, isStockSymbol, type EarningsEvent } from "@cwf/core";
import { laneHaltAsset } from "@/features/markets/session/model";
import { useMarketSession } from "@/features/markets/session/useMarketSession";
import { useClockValue } from "@/lib/clock";
import { STOCKS } from "./copy";

export interface NextReport {
  text: string;
  /** False while the calendar is unknown (the dash), true once it answered — an empty answer is a real "none". */
  known: boolean;
}

export function reportDay(dateEt: string, hour: EarningsEvent["hour"]): string {
  const day = new Date(`${dateEt}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return hour ? `${day} · ${STOCKS.hour[hour]}` : day;
}

export function useNextReport(symbol: string): NextReport {
  const session = useMarketSession(isStockSymbol(symbol) ? laneHaltAsset(symbol, "regular") : undefined);
  const minute = useClockValue((ms) => Math.floor(ms / 60_000));
  const events = session?.earnings ?? null;
  if (!events || minute === 0) return { text: STOCKS.dash, known: false };
  const today = etDateOf(minute * 60);
  const next = events.filter((e) => e.symbol === symbol && e.dateEt >= today).sort((a, b) => a.dateEt.localeCompare(b.dateEt))[0];
  return next ? { text: reportDay(next.dateEt, next.hour), known: true } : { text: STOCKS.reportNone, known: true };
}
