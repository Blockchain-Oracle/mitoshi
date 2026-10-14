/**
 * The board's chain read (ops' `board-cache` actor; R6 shell S04): for each id, the lens facts and the takers' book at
 * `BOARD_DEPTH` — the same two reads the browser's display path makes (`readWindowsSliced`, `readBookBatched`), through
 * this process's read runtime, which ops paces with `setReadBudget`. A Window no longer open has no book worth a call.
 */
import type { MarketId } from "@cwf/core";
import { readBookBatched, readWindowsSliced, TAKER_MIN_REST_SEC } from "../engine/lens";
import { BOARD_DEPTH, type BoardEntry } from "./wire";

const EMPTY = { bids: [], asks: [] } as const;

export async function readBoardEntries(ids: readonly MarketId[], nowMs: () => number = Date.now): Promise<Map<MarketId, BoardEntry>> {
  if (ids.length === 0) return new Map();
  const facts = await readWindowsSliced(ids);
  const found = [...facts.values()];
  const books = await Promise.all(found.map((f) => (f.snapshot.state === "open" ? readBookBatched(f.marketId, TAKER_MIN_REST_SEC, BOARD_DEPTH).catch(() => null) : Promise.resolve(EMPTY))));
  const atMs = nowMs();
  const out = new Map<MarketId, BoardEntry>();
  found.forEach((f, i) => {
    const book = books[i];
    if (book) out.set(f.marketId, { facts: f, book, atMs });
  });
  return out;
}
