import "server-only";
/**
 * `/activity` signed out (R6 money, T10; D-230): the public settlement feed — the last 20 Windows to settle, from the
 * indexer's tables (`indexReader(...).markets({ settled: true })`), read once a few minutes and shared by every reader
 * as the landing's board is (Owarine 90a91d71's ticker-hub `settlementItems` is the precedent). Each row is a fact
 * anyone can check at `/proof/<market>`. Null when the index can't be read, so the page says so instead of inventing.
 */
import { cacheLife } from "next/cache";
import { isTickerSymbol } from "@cwf/core";
import { indexReader, type IdxRow } from "@cwf/db/idx";
import { db } from "@/server/db";

export interface SettledItem {
  market: string;
  symbol: string;
  cadenceSec: number;
  /** When it settled (the resolve's block time), else its close. */
  atSec: number;
  outcome: "up" | "down" | "void";
}

export interface PublicFeed {
  items: SettledItem[];
  /** When this read was taken: the page's "Updated 12 s ago" counts from it. */
  readAtMs: number;
}

const FEED_SIZE = 20;

function outcomeOf(row: IdxRow): SettledItem["outcome"] {
  if (row.state === "voided" || Number(row.winner) === 2) return "void";
  return Number(row.winner) === 0 ? "up" : "down";
}

/** Throws when the index can't be read, so a failed read is never what the cache keeps. */
async function read(): Promise<PublicFeed> {
  "use cache";
  cacheLife("minutes");
  const rows = await indexReader(db()).markets({ settled: true, limit: FEED_SIZE });
  return {
    readAtMs: Date.now(),
    items: rows
      .filter((row) => isTickerSymbol(String(row.symbol)))
      .map((row) => ({
        market: String(row.market),
        symbol: String(row.symbol),
        cadenceSec: Number(row.cadence_sec),
        atSec: Number(row.resolved_ts_sec ?? row.expiry_sec),
        outcome: outcomeOf(row),
      })),
  };
}

export async function publicFeed(): Promise<PublicFeed | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}
