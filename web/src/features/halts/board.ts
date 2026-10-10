/**
 * The halts board's rows (S6; 21st 5693's one row per service + 26906's day bars): one row per ticker — its halt now
 * (from the live board), its last halt, and 30 ET days, each marked by the halts on either of its feeds (the Regular
 * feed `TSLA` and the 24/7 feed `TSLA-24`). A day before halt-watch's log covers it says so instead of "no halt".
 */
import { addDays, etDateOf, etWallToUtcSec, formatEtClock, haltLabel, TICKER_SYMBOLS, TICKERS, type HaltBoard, type HaltEntry, type TickerSymbol } from "@cwf/core";
import { overlapSec, type HaltEpisode } from "./episodes";

export const BOARD_DAYS = 30;

export type DayTone = "none" | "clear" | "stale" | "halted";

export interface BoardDay {
  date: string;
  tone: DayTone;
  /** One line per halt that touched the day: "Signed price stale · 24/7 feed · 11:39–11:41 ET". */
  lines: string[];
}

export interface BoardRow {
  symbol: TickerSymbol;
  name: string;
  /** The halt holding now on either feed (the Regular feed's first), or null. */
  now: (HaltEntry & { feed: "regular" | "24/7" }) | null;
  /** No signed source at all (SPCX on testnet): never watched, never halted. */
  unwatched: boolean;
  last: HaltEpisode | null;
  days: BoardDay[];
}

const feedOf = (asset: string) => (asset.endsWith("-24") ? "24/7 feed" : "Regular feed");
const symbolOf = (asset: string) => asset.replace(/-24$/, "");
const span = (ep: HaltEpisode, nowSec: number) => {
  const mins = Math.round(((ep.endSec ?? nowSec) - ep.startSec) / 60);
  return mins < 1 ? "under a minute" : mins < 120 ? `${mins} min` : `${Math.round(mins / 60)} h`;
};

/** "Signed price stale · 24/7 feed · 11:39–11:41 ET (2 min)". */
export function episodeLine(ep: HaltEpisode, nowSec: number): string {
  const end = ep.endSec === null ? "now" : `${formatEtClock(ep.endSec)} ET`;
  return `${haltLabel(ep.reason)} · ${feedOf(ep.asset)} · ${formatEtClock(ep.startSec)}–${end} (${span(ep, nowSec)})`;
}

export function boardRows(episodes: readonly HaltEpisode[], live: HaltBoard, coveredFromSec: number | null, nowSec: number): BoardRow[] {
  const today = etDateOf(nowSec);
  const dates = Array.from({ length: BOARD_DAYS }, (_, i) => addDays(today, i - BOARD_DAYS + 1));
  const coveredFrom = coveredFromSec === null ? null : etDateOf(coveredFromSec);
  return TICKER_SYMBOLS.map((symbol) => {
    const t = TICKERS[symbol];
    const mine = episodes.filter((e) => symbolOf(e.asset) === symbol);
    const regular = live[symbol];
    const all247 = (live as Record<string, HaltEntry | undefined>)[`${symbol}-24`];
    const days = dates.map((date): BoardDay => {
      if (coveredFrom === null || date < coveredFrom) return { date, tone: "none", lines: [] };
      const from = etWallToUtcSec(date, 0);
      const to = etWallToUtcSec(addDays(date, 1), 0);
      const hits = mine.filter((e) => overlapSec(e, from, to, nowSec) > 0);
      const tone: DayTone = hits.some((e) => haltLabel(e.reason) === "Trading halted") ? "halted" : hits.length ? "stale" : "clear";
      return { date, tone, lines: hits.map((e) => episodeLine(e, nowSec)) };
    });
    return {
      symbol,
      name: t.name,
      now: regular ? { ...regular, feed: "regular" } : all247 ? { ...all247, feed: "24/7" } : null,
      unwatched: !t.redstoneFeedId,
      last: mine.at(-1) ?? null,
      days,
    };
  });
}
