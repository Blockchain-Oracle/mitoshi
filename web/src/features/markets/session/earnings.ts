/**
 * The earnings line beside the session cell (S6, G-13 of the Agari ledger; L-32: a warning, never a blocker). Ported from
 * Agari 03b30ab:web/src/features/markets/lanes/lane-view.ts `earningsWarning` with its words (`copy-lanes.ts`
 * `LANE_STATE.earnings`): core `earningsEventFor` decides whether the Window on screen sits on a report — a Regular
 * Window on a report date, a Gap over an after-close Friday or a before-open Monday; 24/7 Windows never. Off that Window,
 * the next report inside ops' lookahead is named plainly so nobody is surprised by it. Null events = unknown: nothing.
 */
import { earningsEventFor, ET_WEEKDAY_SHORT, etDateOf, isStockSymbol, weekdayOfDate, type EarningsEvent, type FlagWindow } from "@cwf/core";

export const EARNINGS_WORDS = {
  hour: { bmo: "before the open", amc: "after the close", dmh: "during market hours" },
  today: "today",
  session: (asset: string, when: string) => `${asset} reports ${when} — prices can gap`,
  gap: (asset: string, when: string) => `${asset} reports ${when} — the Monday open can gap`,
  next: (asset: string, when: string) => `${asset} reports ${when}`,
} as const;

export interface EarningsNote {
  /** `warning`: the Window on screen sits on the report; `info`: the next report, ahead. */
  tone: "warning" | "info";
  text: string;
}

/** "Tue 10-20" — a report's ET date (a date, not an instant: no zone to convert). */
const day = (dateEt: string) => `${ET_WEEKDAY_SHORT[weekdayOfDate(dateEt)]} ${dateEt.slice(5)}`;

export function earningsNote(symbol: string, window: FlagWindow | null, events: readonly EarningsEvent[] | null, nowSec: number): EarningsNote | null {
  if (!events || !isStockSymbol(symbol)) return null;
  const hit = window ? earningsEventFor(symbol, window, events) : null;
  if (hit) {
    const { hour } = hit.event;
    if (hit.flag === "earnings-session") return { tone: "warning", text: EARNINGS_WORDS.session(symbol, hour ? `${EARNINGS_WORDS.hour[hour]} ${EARNINGS_WORDS.today}` : EARNINGS_WORDS.today) };
    const friday = hour === "amc";
    return { tone: "warning", text: EARNINGS_WORDS.gap(symbol, `${EARNINGS_WORDS.hour[friday ? "amc" : "bmo"]} ${ET_WEEKDAY_SHORT[weekdayOfDate(etDateOf(friday ? window!.tradingStartSec : window!.expirySec))]}`) };
  }
  const today = etDateOf(nowSec);
  const next = events.filter((e) => e.symbol === symbol && e.dateEt >= today).sort((a, b) => a.dateEt.localeCompare(b.dateEt))[0];
  if (!next) return null;
  const when = next.dateEt === today ? EARNINGS_WORDS.today : day(next.dateEt);
  return { tone: "info", text: EARNINGS_WORDS.next(symbol, next.hour ? `${when}, ${EARNINGS_WORDS.hour[next.hour]}` : when) };
}
