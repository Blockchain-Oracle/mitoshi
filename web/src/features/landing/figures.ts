import "server-only";
/**
 * The landing's live figures (S20, L-11): what the indexer has counted on Moderato — only real on-chain numbers (21st
 * map, stats row). Read at request time, never at build (the build has no database), and kept for minutes in memory
 * (`use cache`, Next's documented pairing with `cacheLife`); the caller awaits `connection()` inside a Suspense
 * boundary. Null when the index can't be read: the section then says nothing rather than show a made-up number.
 */
import { cacheLife } from "next/cache";
import { indexReader } from "@cwf/db/idx";
import { db } from "@/server/db";

export interface LandingFigures {
  windowsOpened: number;
  windowsResolved: number;
  windowsOpen: number;
  /** Settled since UTC midnight. */
  settledToday: number;
  fills: number;
}

export interface SettledReceipt {
  market: string;
  symbol: string;
  cadenceSec: number;
  basis: number;
  outcome: "up" | "down" | "void";
  openE8: string | null;
  closeE8: string | null;
  signers: number | null;
  resolvedSec: number | null;
}

/** Throws when the index can't be read, so a failed read is never what the cache keeps for minutes. */
async function headline(): Promise<LandingFigures> {
  "use cache";
  cacheLife("minutes");
  const r = await indexReader(db()).headline();
  return { windowsOpened: Number(r.windows_opened), windowsResolved: Number(r.windows_resolved), windowsOpen: Number(r.windows_open), settledToday: Number(r.settled_today), fills: Number(r.fills) };
}

type Prints = Record<string, { priceE8?: string; signers?: number }> | null;

/** The newest settled Window of five different assets, with open and close (R6 landing L07); minutes old at most. */
async function receipts(): Promise<SettledReceipt[]> {
  "use cache";
  cacheLife("minutes");
  const rows = await indexReader(db()).recentSettledBySymbol(5);
  return rows.map((row) => {
    const prints = row.prints as Prints;
    const voided = row.state === "voided" || Number(row.winner) === 2;
    return {
      market: String(row.market),
      symbol: String(row.symbol),
      cadenceSec: Number(row.cadence_sec),
      basis: Number(row.basis),
      outcome: voided ? "void" : Number(row.winner) === 0 ? "up" : "down",
      openE8: prints?.["0"]?.priceE8 ?? null,
      closeE8: prints?.["1"]?.priceE8 ?? null,
      signers: prints?.["1"]?.signers ?? null,
      resolvedSec: row.resolved_ts_sec === null || row.resolved_ts_sec === undefined ? null : Number(row.resolved_ts_sec),
    };
  });
}

export async function landingReceipts(): Promise<SettledReceipt[] | null> {
  try {
    return await receipts();
  } catch {
    return null;
  }
}

export async function landingFigures(): Promise<LandingFigures | null> {
  try {
    return await headline();
  } catch {
    return null;
  }
}
