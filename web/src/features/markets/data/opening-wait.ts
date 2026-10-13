/**
 * The "waiting for the opening print" state in words (D-230 item 1, the owner's SOL 5m screenshot: UP/DOWN off under a
 * bare "Waiting for the opening print", no time, no reason). When the Window opened, a count that moves every second,
 * and why: inside the relay's usual lag, the seconds left of it; past it, how long it has waited — neutral, unless ops
 * names the cause (`/session.prints`: RedStone refusing, unsigned or unreachable; Tempo too busy to take the sends). And
 * an empty side of a trading book (item 2), said instead of a bare "—". Pure.
 */
import type { EventMarket } from "@cwf/core";
import { EMPTY_BOOK, LANE_CARD, OPENING_WAIT } from "../copy";
import type { PrintsState } from "../session/model";

/** The usual lag before ops reports its own (`/session.prints.openLagSec`): RedStone signs T by T + 4 s, one send. */
export const DEFAULT_OPEN_LAG_SEC = 8;

/** `m:ss` of a span in seconds. */
export const spanText = (sec: number): string => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.floor(sec)) % 60).padStart(2, "0")}`;

const two = (n: number) => String(n).padStart(2, "0");
/**
 * The reader's wall clock to the second, 24-hour and fixed ("15:05:00") in every locale: an en-US reader got
 * "04:05:00 PM" from the locale's own format, and the line read differently from the docs and the ship step's check.
 */
export const openedAtText = (sec: number): string => {
  const d = new Date(sec * 1000);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};

export function openingWaitLine(i: { startSec: number; nowSec: number; prints: PrintsState | null; unread?: boolean; at?: (sec: number) => string }): string {
  const at = (i.at ?? openedAtText)(i.startSec);
  if (i.unread) return OPENING_WAIT.unread(at);
  const waited = Math.max(0, i.nowSec - i.startSec);
  const stall = i.prints?.stall && i.prints.stall.sinceSec <= i.startSec ? i.prints.stall : null;
  if (stall) return OPENING_WAIT[stall.kind](at, spanText(waited));
  const expected = Math.max(1, i.prints?.openLagSec ?? DEFAULT_OPEN_LAG_SEC);
  if (waited < expected) return OPENING_WAIT.soon(at, `${expected - waited}s`);
  return OPENING_WAIT.late(at, spanText(waited));
}

/**
 * A wait line around its count ("~4s", "0:42"), which ticks every second: a live region announces the words and keeps
 * the count out (`aria-live="off"`), or a screen reader reads the line out every second. Null for a line with no count.
 */
export function splitCount(text: string): { before: string; count: string; after: string } | null {
  const from = text.indexOf(" · ");
  if (from < 0) return null;
  const m = /~\d+s|\d+:\d{2}/.exec(text.slice(from + 3));
  if (!m) return null;
  const at = from + 3 + m.index;
  return { before: text.slice(0, at), count: m[0], after: text.slice(at + m[0].length) };
}

/** Short words for the wait where a full line won't fit: `soon` with the seconds left of the usual lag, else `late`. */
export interface WaitWords {
  soon: (at: string, left: string) => string;
  late: (at: string, waited: string) => string;
}

/**
 * The open time and the count, short (a lane card's one-line strip, "OPENED 15:05:00 · WAITING 0:42"; the hero's line
 * under its question): past the usual lag, or once ops names a stall for this open, it counts up instead of down.
 */
export function openingWaitShort(i: { startSec: number; nowSec: number; prints: PrintsState | null; at?: (sec: number) => string }, words: WaitWords = LANE_CARD.pending): string {
  const at = (i.at ?? openedAtText)(i.startSec);
  const waited = Math.max(0, i.nowSec - i.startSec);
  const stall = Boolean(i.prints?.stall && i.prints.stall.sinceSec <= i.startSec);
  const expected = Math.max(1, i.prints?.openLagSec ?? DEFAULT_OPEN_LAG_SEC);
  return !stall && waited < expected ? words.soon(at, `${expected - waited}s`) : words.late(at, spanText(waited));
}

/** A Window's first stretch, when an empty side means the house hasn't quoted it yet (it does within seconds, D-230). */
export const QUOTING_SEC = 90;
/** From here to the entry cutoff the house quotes only its exit tail (lock − 75, ops `seed-maker/quote.ts`). */
export const TAIL_SEC = 75;

/**
 * Why a side of a trading Window has nothing to take, in plain words (D-230 item 2): early, the house is about to quote
 * it; in the last stretch, the next Window opens at the expiry (`closing`: a tap can schedule a call on it).
 */
export function emptyBookWhy(market: Pick<EventMarket, "tradingStartSec" | "lockAtSec" | "expirySec">, nowSec: number, nextOpen: (sec: number) => string = openedAtText): { text: string; closing: boolean } {
  if (nowSec < market.tradingStartSec + QUOTING_SEC) return { text: EMPTY_BOOK.quoting, closing: false };
  if (nowSec >= market.lockAtSec - TAIL_SEC) return { text: EMPTY_BOOK.closing(nextOpen(market.expirySec)), closing: true };
  return { text: EMPTY_BOOK.none, closing: false };
}

/** Why the book's top shows no price (D-230 item 2): not read yet says nothing; a failed read says so; else the book. */
export function bookNote(top: { hydrating: boolean; failed: boolean }, market: Pick<EventMarket, "tradingStartSec" | "lockAtSec" | "expirySec">, nowSec: number): string | null {
  if (top.hydrating) return null;
  if (top.failed) return EMPTY_BOOK.unread;
  return emptyBookWhy(market, nowSec).text;
}
