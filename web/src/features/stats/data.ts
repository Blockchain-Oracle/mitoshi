import "server-only";
/**
 * `/stats`'s data (S5, L-15): `readTraction` over the index, told who the house, the Trading Balance vaults and the
 * product contracts are (`demandAddresses`, D-215). Read at request time, kept for minutes in memory (`use cache` +
 * `cacheLife`, as the landing's figures), null when the index can't be read: the page then says so and shows no number.
 */
import { cacheLife } from "next/cache";
import { readTraction, type Traction } from "@cwf/db/idx";
import { db } from "@/server/db";
import { demandAddresses } from "@/server/demand";

/** Throws when the index can't be read, so a failed read is never what the cache keeps for minutes. */
async function computeStats(): Promise<Traction & { computedAtMs: number }> {
  "use cache";
  cacheLife("minutes");
  const t = await readTraction(db(), { ...demandAddresses(), nowSec: Math.floor(Date.now() / 1000) });
  return { ...t, computedAtMs: Date.now() };
}

export async function readStats(): Promise<(Traction & { computedAtMs: number }) | null> {
  try {
    return await computeStats();
  } catch {
    return null;
  }
}
