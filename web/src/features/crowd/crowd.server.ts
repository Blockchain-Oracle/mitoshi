import "server-only";
/**
 * The crowd reading per ticker for `/api/sentiment` (S6): the index's demand lean (`readCrowdLean`, the house never
 * counted, D-215), read at request time and kept for minutes in memory; a failed read throws, so it is never cached.
 */
import { cacheLife } from "next/cache";
import { readCrowdLean } from "@cwf/db/idx";
import { db } from "@/server/db";
import { demandAddresses } from "@/server/demand";
import { readCrowd as readCrowdOver, type CrowdReading } from "./reading";

export async function readCrowd(symbol: string): Promise<CrowdReading> {
  "use cache";
  cacheLife("minutes");
  const { house } = demandAddresses();
  return readCrowdOver(symbol, Math.floor(Date.now() / 1000), (sinceSec) => readCrowdLean(db(), { house, symbol, sinceSec }));
}
