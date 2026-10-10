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
  fills: number;
}

export async function landingFigures(): Promise<LandingFigures | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const r = await indexReader(db()).headline();
    return { windowsOpened: Number(r.windows_opened), windowsResolved: Number(r.windows_resolved), windowsOpen: Number(r.windows_open), fills: Number(r.fills) };
  } catch {
    return null;
  }
}
