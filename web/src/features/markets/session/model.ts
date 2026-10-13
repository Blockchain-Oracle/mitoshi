// Ported from Agari 03b30ab:web/src/features/markets/session/useMarketSession.ts (its pure half) — the body arrives on
// the ops stream's `session` and `halts` topics instead of a poll, and is read by hand: the terminal ships no zod (F-S23-08).
import {
  HALT_REASONS,
  haltAssetOf,
  haltLabel,
  haltOf,
  laneKey,
  sessionLabel,
  sessionStatus,
  type CorporateSkip,
  type EarningsEvent,
  type HaltAsset,
  type HaltBoard,
  type HaltEntry,
  type HaltReason,
  type LaneBasis,
  type SessionCalendar,
  type SessionStatus,
  type TickerSymbol,
  type TradingSession,
} from "@cwf/core";

/** The ops `GET /session` body as the web keeps it (`services/ops/src/http/session.ts`), checked field by field. */
export interface SessionBody {
  nowSec: number;
  today: TradingSession | null;
  calendar: { fromDate: string; toDate: string; unknownDates: readonly string[]; upcoming: readonly TradingSession[]; recent: readonly TradingSession[] } | null;
  /** Roller lane states keyed by core `laneKey`: `open #22 …`, `waiting: next …`, `paused: no signed source …`, `closed: no session`. */
  lanes: Readonly<Record<string, string>>;
  halts: HaltBoard;
  /** Report dates 14 days ahead; null = unknown, never "none". */
  earnings: readonly EarningsEvent[] | null;
  skips: readonly CorporateSkip[];
  /** The price relay's word (D-230): how long an opening print usually takes, and whether prints are stalled. */
  prints?: PrintsState | null;
}

/**
 * Why prints stall (ops `http/session.ts`): RedStone refuses us, hasn't signed T yet, or can't be reached; or the print
 * is in hand and Tempo's RPC keeps refusing the sends (`sending`).
 */
export type PrintStallKind = "refused" | "unsigned" | "unreachable" | "sending";

export interface PrintsState {
  /** Median seconds from a Window's start to its opening print, over the relay's last opens; null before any. */
  openLagSec: number | null;
  /** Due prints stuck for over 20 s (on the price network, or on sends Tempo refuses): since when, and why; null while they land. */
  stall: { sinceSec: number; kind: PrintStallKind } | null;
}

export interface MarketSession {
  /** Recomputed at read time from the agreed calendar, so a boundary turns over without waiting on ops. */
  status: SessionStatus;
  /** "Closes 16:00 ET", "Opens Mon 09:30 ET", "Trading halted", "Signed price stale", or "Closed". */
  label: string;
  /** Regular hours (early close and a halt included): the only state in which Regular Windows run. */
  open: boolean;
  /** The asked-about asset's halt, at any hour (a 24/7 lane halts at the weekend too); null without an asset. */
  halt: HaltEntry | null;
  lanes: Readonly<Record<string, string>>;
  halts: HaltBoard;
  earnings: readonly EarningsEvent[] | null;
  skips: readonly CorporateSkip[];
  /** Every session the calendar names, recent through upcoming, ascending. */
  sessions: readonly TradingSession[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function sessionOf(v: unknown): TradingSession | null {
  if (!isObj(v) || !isStr(v.date) || !isNum(v.openSec) || !isNum(v.closeSec) || typeof v.earlyClose !== "boolean") return null;
  return { date: v.date, openSec: v.openSec, closeSec: v.closeSec, earlyClose: v.earlyClose };
}

const sessionsOf = (v: unknown): TradingSession[] => (Array.isArray(v) ? v.map(sessionOf).filter((s): s is TradingSession => s !== null) : []);

/** A halt board as ops serves it; entries with an unknown reason are dropped, never guessed. */
export function parseHaltBoard(v: unknown): HaltBoard {
  const board: HaltBoard = {};
  if (!isObj(v)) return board;
  for (const [asset, entry] of Object.entries(v)) {
    if (!isObj(entry) || !isNum(entry.sinceSec) || !(HALT_REASONS as readonly unknown[]).includes(entry.reason)) continue;
    board[asset as HaltAsset] = { reason: entry.reason as HaltReason, sinceSec: entry.sinceSec };
  }
  return board;
}

const STALL_KINDS: readonly PrintStallKind[] = ["refused", "unsigned", "unreachable", "sending"];

/** `/session.prints`, or null when ops doesn't send it (an older deploy): the app then words the wait without it. */
export function parsePrints(v: unknown): PrintsState | null {
  if (!isObj(v)) return null;
  const stall = isObj(v.stall) && isNum(v.stall.sinceSec) && (STALL_KINDS as readonly unknown[]).includes(v.stall.kind) ? { sinceSec: v.stall.sinceSec, kind: v.stall.kind as PrintStallKind } : null;
  return { openLagSec: isNum(v.openLagSec) ? v.openLagSec : null, stall };
}

/** The `/session` body, or null when it isn't one (the surfaces then say nothing about hours). */
export function parseSessionBody(v: unknown): SessionBody | null {
  if (!isObj(v) || !isNum(v.nowSec)) return null;
  const status = isObj(v.status) ? v.status : null;
  const cal = isObj(v.calendar) ? v.calendar : null;
  const calendar =
    cal && isStr(cal.fromDate) && isStr(cal.toDate)
      ? {
          fromDate: cal.fromDate,
          toDate: cal.toDate,
          unknownDates: Array.isArray(cal.unknownDates) ? cal.unknownDates.filter(isStr) : [],
          upcoming: sessionsOf(cal.upcoming),
          recent: sessionsOf(cal.recent),
        }
      : null;
  const lanes: Record<string, string> = {};
  if (isObj(v.lanes)) for (const [k, s] of Object.entries(v.lanes)) if (isStr(s)) lanes[k] = s;
  const earnings = Array.isArray(v.earnings)
    ? v.earnings.flatMap((e): EarningsEvent[] =>
        isObj(e) && isStr(e.symbol) && isStr(e.dateEt) ? [{ symbol: e.symbol as TickerSymbol, dateEt: e.dateEt, hour: e.hour === "bmo" || e.hour === "amc" || e.hour === "dmh" ? e.hour : null }] : [],
      )
    : null;
  const skips = Array.isArray(v.skips)
    ? v.skips.flatMap((k): CorporateSkip[] =>
        isObj(k) && isStr(k.symbol) && isStr(k.date) && isStr(k.why)
          ? [{ symbol: k.symbol as TickerSymbol, date: k.date, why: k.why, ...(Array.isArray(k.lanes) ? { lanes: k.lanes.filter(isStr) as LaneBasis[] } : {}) }]
          : [],
      )
    : [];
  return { nowSec: v.nowSec, today: status ? sessionOf(status.session) : null, calendar, lanes, halts: parseHaltBoard(v.halts), earnings, skips, prints: parsePrints(v.prints) };
}

/** The recent sessions, today's (kept once it has closed) and the upcoming ones: every date the core rules will ask about. */
export function calendarOf(body: SessionBody): SessionCalendar | null {
  if (!body.calendar) return null;
  const byDate = new Map<string, TradingSession>();
  for (const s of [...body.calendar.recent, ...(body.today ? [body.today] : []), ...body.calendar.upcoming]) byDate.set(s.date, s);
  const sessions = [...byDate.values()].sort((a, b) => a.openSec - b.openSec);
  return { fromDate: body.calendar.fromDate, toDate: body.calendar.toDate, unknownDates: body.calendar.unknownDates, sessions };
}

/**
 * The session at `nowSec`, carrying `asset`'s halt when one is named. Null when the calendar is missing or disputes
 * today: a surface then says nothing about hours rather than guessing them.
 */
export function toMarketSession(body: SessionBody, nowSec: number, asset?: HaltAsset): MarketSession | null {
  const calendar = calendarOf(body);
  if (!calendar) return null;
  const halt = asset ? haltOf(body.halts, asset) : null;
  const status = sessionStatus(nowSec, calendar, { halted: halt !== null });
  if (!status) return null;
  return {
    status,
    // Only an exchange halt or a Data Streams "closed" says "Trading halted"; RedStone's health says "Signed price stale".
    label: status.state === "halted" && halt ? haltLabel(halt.reason) : sessionLabel(status),
    open: status.state === "regular" || status.state === "early-close" || status.state === "halted",
    halt,
    lanes: body.lanes,
    halts: body.halts,
    earnings: body.earnings,
    skips: body.skips,
    sessions: calendar.sessions,
  };
}

/** The roller's word for one lane, keyed as ops keys it (`TSLA-60m`, `TSLA-gap`, `TSLA-24-5m`, `BTC-5m`). */
export function laneState(session: Pick<MarketSession, "lanes"> | null, symbol: TickerSymbol, basis: LaneBasis, intervalSec: number): string | null {
  return session?.lanes[laneKey(symbol, basis, intervalSec)] ?? null;
}

/** The halt key of a Window's lane: the ticker, or `<T>-24` for a stock's 24/7 lane (its own feed). */
export const laneHaltAsset = (symbol: TickerSymbol, basis: LaneBasis): HaltAsset => haltAssetOf(symbol, basis);
