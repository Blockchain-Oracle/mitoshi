"use client";
// Ported from Agari 03b30ab:web/src/lib/when.ts — the chain-corrected clock from `@/lib/clock`, and one formatter per
// zone built once (S23 F-S23-08: an `Intl.DateTimeFormat` per call was main-thread time on the terminal's first render).
import { sessionPhrase } from "@cwf/core/copy";
import { ET_WEEKDAY_SHORT, etDateOf, formatEtClock, weekdayOfDate, type SessionStatus } from "@cwf/core";
import { useSyncExternalStore } from "react";
import { nowMs } from "./clock";

/**
 * A boundary's time, for the person reading it (S6: "every state names the next open time in local time").
 *
 * The venue keeps NYSE time: a Window opens at the bell, 09:30 ET, and core says so in ET because that is the fact
 * and core is pure. The reader is somewhere else — "opens Tue 09:30 ET" shown to someone in UTC+1 at 14:17 local,
 * thirteen minutes before that bell, was read as another day in another country. So the web renders every such time
 * in the viewer's zone first, with the ET fact kept beside it: "14:30 (09:30 ET)" today, "Wed 14:30 (09:30 ET)" on
 * another day, and plain "09:30 ET" for a reader in Eastern time.
 *
 * The zone is only known in a browser. On the server, and for the hydration render, the string is the ET text, so the
 * two renders match; the first client render after hydration carries the local time.
 */
export interface WhenOptions {
  /** "16:00:00" — a boundary with seconds (the Gap's prints). */
  seconds?: boolean;
  /** The clock alone, never a weekday: "as of 16:00 ET" style slots. */
  clock?: boolean;
  /** The clock that decides "today"; defaults to the chain-corrected one. */
  nowSec?: number;
}

const listeners = new Set<() => void>();
let zone: string | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (zone === null && typeof Intl !== "undefined") {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    if (zone) queueMicrotask(() => listeners.forEach((fn) => fn()));
  }
  return () => void listeners.delete(listener);
}

const getZone = () => zone;
const noZone = () => null;

/** The viewer's IANA zone once hydrated, else null. */
export function useViewerZone(): string | null {
  return useSyncExternalStore(subscribe, getZone, noZone);
}

const etText = (sec: number, seconds: boolean, clock: boolean): string => {
  const hhmm = formatEtClock(sec);
  const time = seconds ? `${hhmm}:${String(sec % 60).padStart(2, "0")}` : hhmm;
  return clock ? `${time} ET` : `${ET_WEEKDAY_SHORT[weekdayOfDate(etDateOf(sec))]} ${time} ET`;
};

type Parts = { time: Intl.DateTimeFormat; timeSec: Intl.DateTimeFormat; day: Intl.DateTimeFormat; date: Intl.DateTimeFormat };
const formatters = new Map<string, Parts>();

function partsFor(tz: string): Parts {
  let f = formatters.get(tz);
  if (!f) {
    f = {
      time: new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }),
      timeSec: new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      day: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }),
      // en-CA gives YYYY-MM-DD, a date that compares as text.
      date: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }),
    };
    formatters.set(tz, f);
  }
  return f;
}

function localParts(sec: number, tz: string, seconds: boolean): { time: string; day: string; date: string } {
  const at = new Date(sec * 1000);
  const f = partsFor(tz);
  return { time: (seconds ? f.timeSec : f.time).format(at), day: f.day.format(at), date: f.date.format(at) };
}

/** Twelve hours: past this, a time without its weekday is read as the wrong day (S23). */
const SOON_SEC = 12 * 3_600;

/**
 * A time may drop its weekday only when it is within twelve hours, on the viewer's date and on the same ET date as
 * now. At 22:04 ET a Wednesday 09:30 open is "Wed 14:30 (09:30 ET)" for a reader in UTC+1, never "14:30 (09:30 ET)".
 */
export function soonSameDay(sec: number, nowSec: number, tz: string, localDate: string): boolean {
  return Math.abs(sec - nowSec) <= SOON_SEC && localParts(nowSec, tz, false).date === localDate && etDateOf(nowSec) === etDateOf(sec);
}

/** The formatter for `tz` (null = ET text), a pure function of its inputs; `useWhen` binds it to the viewer. */
export function whenFor(tz: string | null): (sec: number, options?: WhenOptions) => string {
  return (sec, options = {}) => {
    const seconds = options.seconds ?? false;
    const clock = options.clock ?? false;
    if (!tz) return etText(sec, seconds, clock);
    const local = localParts(sec, tz, seconds);
    const et = etText(sec, seconds, true);
    // The same wall clock in both zones is the same zone for this purpose: say it once.
    if (`${local.time} ET` === et && local.date === etDateOf(sec)) return etText(sec, seconds, clock);
    const nowSec = options.nowSec ?? Math.floor(nowMs() / 1000);
    const etDay = ET_WEEKDAY_SHORT[weekdayOfDate(etDateOf(sec))];
    const etSide = etDay === local.day ? et : `${etDay} ${et}`;
    return `${clock || soonSameDay(sec, nowSec, tz, local.date) ? "" : `${local.day} `}${local.time} (${etSide})`;
  };
}

/** `when(sec)` → "Wed 14:30 (09:30 ET)"; `when(sec, { clock: true })` → "14:30 (09:30 ET)"; ET text until hydrated. */
export function useWhen(): (sec: number, options?: WhenOptions) => string {
  return whenFor(useViewerZone());
}

/**
 * `sessionPhrase` with the boundary in the reader's zone: "Pre-market · opens 14:30 (09:30 ET), in 4h 19m". Call it
 * at the top of a component, never inside a branch.
 */
export function useSessionPhrase(): (status: Pick<SessionStatus, "state" | "date" | "closesAtSec" | "nextOpenSec">, nowSec: number) => string {
  const when = useWhen();
  return (status, nowSec) => sessionPhrase(status, nowSec, (sec) => when(sec, { nowSec }));
}
