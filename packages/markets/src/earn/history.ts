/**
 * Earn's reserve history on the web (R6 money, S09; D-230): the share-price series `/api/earn/history` serves from
 * the ops `reserve-pricer`'s samples (one request, ≤ 300 points), and the reserve's launch time from its deploy
 * block's own timestamp (one `eth_getBlockByNumber`, cached for good) for "since launch · 14 d" when the history can't
 * be read. Amounts arrive as decimal strings and leave as bigints.
 */
import type { Reading, ReserveKind } from "@cwf/core";
import { leverageVenueOf } from "../leverage/deployment";
import { makerVenueOf } from "../maker/deployment";
import { parlayVenueOf } from "../parlay/deployment";
import { rangeVenueOf } from "../range/deployment";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";

export type HistoryRange = "7d" | "30d" | "all";
export const HISTORY_RANGES: readonly HistoryRange[] = ["7d", "30d", "all"];

export interface ReservePoint {
  atSec: number;
  sharePriceRaw: bigint;
  totalValueBase: bigint;
}

export interface ReserveHistory {
  reserve: ReserveKind;
  /** The first stored sample's time (the deploy block's), or null before the pricer's first sample. */
  launchedAtSec: number | null;
  points: ReservePoint[];
  latestAtSec: number | null;
}

/** The wire shape (`/api/earn/history`): bigints as decimal strings. */
export interface ReserveHistoryWire {
  reserve: ReserveKind;
  launchedAtSec: number | null;
  points: { atSec: number; sharePriceRaw: string; totalValueBase: string }[];
  latestAtSec: number | null;
}

export const fromWire = (w: ReserveHistoryWire): ReserveHistory => ({
  reserve: w.reserve,
  launchedAtSec: w.launchedAtSec,
  latestAtSec: w.latestAtSec,
  points: w.points.map((p) => ({ atSec: p.atSec, sharePriceRaw: BigInt(p.sharePriceRaw), totalValueBase: BigInt(p.totalValueBase) })),
});

export async function getReserveHistory(kind: ReserveKind, range: HistoryRange): Promise<Reading<ReserveHistory>> {
  return withReading(`reserveHistory:${kind}:${range}`, async () => {
    const res = await fetch(`/api/earn/history?reserve=${kind}&range=${range}`);
    if (!res.ok) throw new Error(`earn history ${res.status}`);
    return fromWire((await res.json()) as ReserveHistoryWire);
  });
}

function deployBlockOf(kind: ReserveKind, chainId: number): bigint | null {
  switch (kind) {
    case "maker":
      return makerVenueOf(chainId)?.fromBlock ?? null;
    case "range":
      return rangeVenueOf(chainId)?.fromBlock ?? null;
    case "parlay":
      return parlayVenueOf(chainId)?.fromBlock ?? null;
    case "boost":
      return leverageVenueOf(chainId)?.fromBlock ?? null;
  }
}

/** When the reserve was deployed: its deploy block's timestamp; null where it isn't deployed. */
export async function getReserveLaunchedAtSec(kind: ReserveKind): Promise<Reading<number | null>> {
  return withReading(`reserveLaunched:${kind}`, async () => {
    const client = await getPublicClient();
    const block = deployBlockOf(kind, client.chain.id);
    if (!block) return null;
    return Number((await client.getBlock({ blockNumber: block })).timestamp);
  });
}
