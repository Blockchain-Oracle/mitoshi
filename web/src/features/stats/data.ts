import "server-only";
/**
 * `/stats`'s data (S5, L-15): `readTraction` over the index, told which addresses are the house (the role keys in
 * `HOUSE_TRADERS` and the maker vault), which are Trading Balance vaults (current and previous, D-213) and which are
 * product contracts that take for someone the index can't name yet. Read at request time, kept for minutes in memory
 * (`use cache` + `cacheLife`, as the landing's figures), null when the index can't be read: the page then says so and
 * shows no number.
 */
import { cacheLife } from "next/cache";
import { HOUSE_TRADERS, NETWORKS } from "@cwf/core";
import { readTraction, type Traction } from "@cwf/db/idx";
import { deploymentsWithHistory, type Area } from "@cwf/markets";
import { webEnv } from "@/lib/env";
import { db } from "@/server/db";

const VAULTS: readonly [Area, string][] = [["vault", "EventVault"], ["vault2", "EventVaultV2"]];
const PRODUCTS: readonly [Area, string][] = [["leverage", "LeverageReserve"], ["parlay", "ParlayReserve"], ["range", "RangeReserve"], ["private", "PrivateDesk"]];

const addresses = (pairs: readonly [Area, string][], chainId: number) =>
  pairs.flatMap(([area, name]) => deploymentsWithHistory(area, name, chainId).map((d) => d.address.toLowerCase()));

/** Throws when the index can't be read, so a failed read is never what the cache keeps for minutes. */
async function computeStats(): Promise<Traction & { computedAtMs: number }> {
  "use cache";
  cacheLife("minutes");
  const network = webEnv.markets.network;
  const chainId = NETWORKS[network];
  const t = await readTraction(db(), {
    house: [...HOUSE_TRADERS[network], ...addresses([["maker", "MarketMakerVault"]], chainId)],
    vaults: addresses(VAULTS, chainId),
    products: addresses(PRODUCTS, chainId),
    nowSec: Math.floor(Date.now() / 1000),
  });
  return { ...t, computedAtMs: Date.now() };
}

export async function readStats(): Promise<(Traction & { computedAtMs: number }) | null> {
  try {
    return await computeStats();
  } catch {
    return null;
  }
}
