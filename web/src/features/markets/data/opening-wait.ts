/**
 * The "waiting for the opening print" state in words (D-230 item 1, the owner's SOL 5m screenshot: UP/DOWN off under a
 * bare "Waiting for the opening print", no time, no reason). When the Window opened, a count that moves every second,
 * and why: inside the relay's usual lag, the seconds left of it; past it, how long it has waited and — when ops says
 * the prints are stalled (`/session.prints`) — the price network's reason. And an empty side of a trading book
 * (item 2), said instead of a bare "—". Pure.
 */
import type { EventMarket } from "@cwf/core";
import { EMPTY_BOOK, OPENING_WAIT } from "../copy";
import type { PrintsState } from "../session/model";

/** The usual lag before ops reports its own (`/session.prints.openLagSec`): RedStone signs T by T + 4 s, one send. */
export const DEFAULT_OPEN_LAG_SEC = 8;

/** `m:ss` of a span in seconds. */
export const spanText = (sec: number): string => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.floor(sec)) % 60).padStart(2, "0")}`;

let clock: Intl.DateTimeFormat | null = null;
/** The reader's wall clock to the second ("15:05:00"). */
export const openedAtText = (sec: number): string => (clock ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })).format(sec * 1000);

export function openingWaitLine(i: { startSec: number; nowSec: number; prints: PrintsState | null; unread?: boolean; at?: (sec: number) => string }): string {
  const at = (i.at ?? openedAtText)(i.startSec);
  if (i.unread) return OPENING_WAIT.unread(at);
  const waited = Math.max(0, i.nowSec - i.startSec);
  const stall = i.prints?.stall && i.prints.stall.sinceSec <= i.startSec ? i.prints.stall : null;
  if (stall?.kind === "refused") return OPENING_WAIT.refused(at, spanText(waited));
  if (stall?.kind === "unreachable") return OPENING_WAIT.unreachable(at, spanText(waited));
  const expected = Math.max(1, i.prints?.openLagSec ?? DEFAULT_OPEN_LAG_SEC);
  if (!stall && waited < expected) return OPENING_WAIT.soon(at, `${expected - waited}s`);
  return OPENING_WAIT.late(at, spanText(waited));
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
