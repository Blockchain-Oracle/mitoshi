/**
 * The `ticks` topic (S23a, D-196): every display quote, coalesced once for the whole process to ≤ 8 a second per
 * ticker (`GAP_MS`), sent to every stream listening on `ticks` — ephemerally (`bus.emit`): display ticks never enter the
 * 5,000-event replay ring, so a reconnecting tab still replays its fills and verdicts, and gets the newest tick from
 * the topic's snapshot instead of a backlog. One topic for every ticker: a market switch never changes a tab's topic
 * set (which would reconnect its one stream). ≈ 3 KB/s at full crypto speed.
 */
import type { Bus } from "../runtime/bus";
import { createCoalescer } from "./coalesce";
import type { DisplayFeed, DisplayQuote } from "./types";

export const TICKS_TOPIC = "ticks";
export const GAP_MS = 125;

export const wireDisplay = (q: DisplayQuote) => ({ symbol: q.symbol, priceE8: q.priceE8.toString(), atMs: q.atMs, source: q.source });

export function publishTicks(feed: DisplayFeed, bus: Bus): () => void {
  const coalescer = createCoalescer<DisplayQuote>((_symbol, q) => bus.emit(TICKS_TOPIC, "tick", wireDisplay(q)), GAP_MS);
  const off = feed.subscribe((q) => coalescer.push(q.symbol, q));
  return () => {
    off();
    coalescer.stop();
  };
}
