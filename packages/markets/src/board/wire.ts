/**
 * The board (R6 shell S04, D-230): what ops' `board-cache` actor serves so N viewers cost the RPC one read. Each recent
 * Window's lens facts and its top `BOARD_DEPTH` book levels a side, as the browser's own display reads would have read
 * them — so the browser decodes an entry and runs the same `depthFromBook`, `groupIntoLanes`, snapshot views on it. The
 * write-gating reads (`freshQuoteStake`, `freshExitQuote`, the send's own lens read) never come from here (canon #1).
 *
 * Pure: the codec carries bigints as `{"$n":"…"}` (unambiguous, unlike a suffixed string) and a version, so an ops and a
 * web from different builds fail closed (the browser falls back to the chain) rather than misread each other.
 */
import type { MarketId } from "@cwf/core";
import type { WindowFacts } from "../engine/lens";
import type { YesBook } from "../engine/quote";

export const BOARD_VERSION = 1;
/** Levels a side ops reads per Window: a card, the hero and the ticket's ladder ask for 10 or fewer. */
export const BOARD_DEPTH = 10;
/** An entry older than this (ops' sweep is 15 s) is not trusted for display: the browser reads the chain instead. */
export const BOARD_STALE_MS = 45_000;

export interface BoardEntry {
  facts: WindowFacts;
  /** The book at `BOARD_DEPTH` levels a side, takers' view (`TAKER_MIN_REST_SEC`). */
  book: YesBook;
  /** When ops read this Window (its clock). */
  atMs: number;
}

export interface BoardWire {
  v: typeof BOARD_VERSION;
  /** The newest entry's read time. */
  asOfMs: number;
  /** The Windows open and before their lock, soonest expiry first (`/v1/board` only; null on `/v1/windows`). */
  live: MarketId[] | null;
  windows: Record<string, BoardEntry>;
}

export function encodeBoard(board: BoardWire): string {
  return JSON.stringify(board, (_k, v: unknown) => (typeof v === "bigint" ? { $n: v.toString() } : v));
}

/** The board, or null for anything that isn't this version's board (a different build, a proxy's error page). */
export function decodeBoard(text: string): BoardWire | null {
  try {
    const parsed = JSON.parse(text, (_k, v: unknown) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const keys = Object.keys(v);
        if (keys.length === 1 && keys[0] === "$n" && typeof (v as { $n: unknown }).$n === "string") return BigInt((v as { $n: string }).$n);
      }
      return v;
    }) as Partial<BoardWire> | null;
    if (!parsed || parsed.v !== BOARD_VERSION || typeof parsed.asOfMs !== "number" || typeof parsed.windows !== "object" || parsed.windows === null) return null;
    return { v: BOARD_VERSION, asOfMs: parsed.asOfMs, live: Array.isArray(parsed.live) ? (parsed.live as MarketId[]) : null, windows: parsed.windows as Record<string, BoardEntry> };
  } catch {
    return null;
  }
}

/** The top `n` levels a side of a board book (the lens answers best-first, so a prefix is the shallower read). */
export function bookTop(book: YesBook, n: number): YesBook {
  return n >= BOARD_DEPTH ? book : { bids: book.bids.slice(0, n), asks: book.asks.slice(0, n) };
}

/** The Windows a lane lists: open and before their lock, soonest expiry first (`listLiveLanes`' own filter). */
export function liveIds(entries: Iterable<BoardEntry>, nowSec: number): MarketId[] {
  return [...entries]
    .filter((e) => e.facts.market.state === "open" && e.facts.market.lockAtSec > nowSec)
    .sort((a, b) => a.facts.market.expirySec - b.facts.market.expirySec)
    .map((e) => e.facts.marketId);
}

/** Engine events after which a Window's snapshot or book may have changed (ops re-reads it; the indexer's `topicsOf`). */
export const WINDOW_EVENTS: ReadonlySet<string> = new Set(["Fill", "OrderExecuted", "OrderRemoved", "OrderReduced", "CompleteSet", "PrintRecorded", "WindowResolved", "WindowOpened", "Redeemed", "CreditWithdrawn"]);
