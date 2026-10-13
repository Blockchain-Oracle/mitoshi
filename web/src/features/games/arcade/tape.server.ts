import "server-only";
import { seedToUint32, TAPE_MAX_POINTS, TAPE_MIN_POINTS, TAPE_Q } from "@cwf/core/games/arcade";
import type { ArcadeTapeRow } from "@cwf/db";
import { indexReader } from "@cwf/db/idx";
import { db } from "@/server/db";

/**
 * Engine v2's terrain (R4-9, D-227; the games spec's "ride the print", after Senryo's server-issued tape): the RedStone
 * prints the venue recorded for a feed — every Window's opening and closing print, signed on chain and indexed in
 * idx_prints — over the last twelve hours, oldest first: as levels over their own range (0..TAPE_Q, Candle Hop) and as
 * print-to-print moves in tenths of a basis point (the sled), both integers. The
 * seed picks the feed, so a board's runs ride BTC and ETH alike. An index with fewer than two prints gives an empty
 * tape, and the run plays on the seed's own line — the server stores that too, so the replay matches.
 */
const FEEDS = ["BTC", "ETH"] as const;
const SPAN_SEC = 12 * 3_600;
/** 1 = 100 % in tenths of a basis point. */
const TENTH_BP = 100_000n;

export async function cutTape(seed: string, nowSec: number): Promise<ArcadeTapeRow> {
  const feed = FEEDS[seedToUint32(seed) % FEEDS.length]!;
  const fromSec = nowSec - SPAN_SEC;
  const rows = await indexReader(db()).printHistory(feed, fromSec, nowSec, 1_000);
  // One price per instant (two sources can sign the same boundary): the first in the index's own order.
  const byTs = new Map<number, bigint>();
  for (const r of rows) {
    const ts = Number(r.source_ts_sec);
    if (!byTs.has(ts)) byTs.set(ts, BigInt(String(r.price_e8)));
  }
  let prices = [...byTs.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  if (prices.length > TAPE_MAX_POINTS) {
    const stride = prices.length / TAPE_MAX_POINTS;
    prices = Array.from({ length: TAPE_MAX_POINTS }, (_, i) => prices[Math.floor(i * stride)]!);
  }
  if (prices.length < TAPE_MIN_POINTS) return { feed, fromSec, toSec: nowSec, points: [], moves: [] };
  const lo = prices.reduce((a, b) => (b < a ? b : a));
  const hi = prices.reduce((a, b) => (b > a ? b : a));
  const span = hi - lo;
  const points = prices.map((p) => (span === 0n ? TAPE_Q / 2 : Number(((p - lo) * BigInt(TAPE_Q)) / span)));
  // The sled's terrain: each print's change from the one before, in tenths of a basis point (integers).
  const moves = prices.slice(1).map((p, i) => Number(((p - prices[i]!) * TENTH_BP) / prices[i]!));
  return { feed, fromSec, toSec: nowSec, points, moves };
}
