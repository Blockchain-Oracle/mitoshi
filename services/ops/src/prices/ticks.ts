/**
 * `price_ticks` (plan C.4.6; 30-day retention): every new spot quote, buffered and written in one insert per poll,
 * and published to the stream's `prices` and `symbol:<T>` topics. Rows older than 30 days are dropped hourly.
 */
import type { Sql } from "@cwf/db";
import type { Bus } from "../runtime/bus";
import type { SpotFeed, SpotQuote } from "./spot";

export const TICK_RETENTION_SEC = 30 * 86_400;

export const wireTick = (q: SpotQuote) => ({ symbol: q.symbol, priceE8: q.priceE8.toString(), publishTimeSec: q.publishTimeSec, source: q.source, signers: q.signers });

export function followTicks(spot: SpotFeed, bus: Bus, sql: Sql | null, log: (why: string) => void): () => void {
  let buffer: SpotQuote[] = [];
  const unsubscribe = spot.subscribe((q) => {
    const tick = wireTick(q);
    bus.publish("prices", "price", tick);
    bus.publish(`symbol:${q.symbol.replace(/-24$/, "")}`, "price", tick);
    if (sql) buffer.push(q);
  });
  const flush = setInterval(() => {
    if (!sql || buffer.length === 0) return;
    const rows = buffer.map((q) => ({ symbol: q.symbol, source: q.source, publish_sec: q.publishTimeSec, price_e8: q.priceE8.toString(), signers: q.signers }));
    buffer = [];
    sql`insert into price_ticks ${sql(rows)} on conflict do nothing`.catch((e: unknown) => log(`price_ticks insert failed: ${e instanceof Error ? e.message : String(e)}`));
  }, 5_000);
  const prune = setInterval(() => {
    if (!sql) return;
    sql`delete from price_ticks where publish_sec < ${Math.floor(Date.now() / 1000) - TICK_RETENTION_SEC}`.catch(() => undefined);
  }, 3_600_000);
  flush.unref();
  prune.unref();
  return () => {
    unsubscribe();
    clearInterval(flush);
    clearInterval(prune);
  };
}
