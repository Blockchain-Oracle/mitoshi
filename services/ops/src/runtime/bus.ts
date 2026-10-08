/**
 * The one real-time bus behind `GET /v1/stream` (D-049): every producer (spot feed, indexer, halt-watch, session,
 * later rooms/takes/activity) publishes `{topic, event, data}`; each gets a monotonic id so a reconnecting EventSource
 * resumes with `Last-Event-ID` from a ring of the newest events. In memory: a restart starts a new id epoch, and a
 * client asking for an id from before it gets the snapshot instead of a replay.
 */
export interface BusEvent {
  /** `<epoch>-<n>`: the epoch changes per process, so a stale id is recognised as such; "" for an ephemeral `emit`. */
  id: string;
  topic: string;
  event: string;
  data: unknown;
}

export interface Bus {
  publish(topic: string, event: string, data: unknown): BusEvent;
  /**
   * Delivers to live listeners only: no id, no ring (S23a). For high-rate display data (`ticks`) a reconnecting client
   * catches up from the topic's snapshot, so it must not push older events out of the replay ring.
   */
  emit(topic: string, event: string, data: unknown): void;
  /** Events after `lastId` on `topics` still held in the ring; null when `lastId` is unknown (too old or another epoch). */
  since(lastId: string, topics: (topic: string) => boolean): BusEvent[] | null;
  subscribe(listener: (e: BusEvent) => void): () => void;
  stats(): { epoch: string; published: number; held: number; listeners: number };
}

export function createBus(capacity = 5_000, epoch = Date.now().toString(36)): Bus {
  const ring: BusEvent[] = [];
  const listeners = new Set<(e: BusEvent) => void>();
  let n = 0;
  return {
    publish(topic, event, data) {
      const e: BusEvent = { id: `${epoch}-${++n}`, topic, event, data };
      ring.push(e);
      if (ring.length > capacity) ring.splice(0, ring.length - capacity);
      for (const l of listeners) {
        try {
          l(e);
        } catch {
          /* a broken listener never stops the bus */
        }
      }
      return e;
    },
    emit(topic, event, data) {
      const e: BusEvent = { id: "", topic, event, data };
      for (const l of listeners) {
        try {
          l(e);
        } catch {
          /* a broken listener never stops the bus */
        }
      }
    },
    since(lastId, topics) {
      const [ep, raw] = lastId.split("-");
      const at = Number(raw);
      if (ep !== epoch || !Number.isInteger(at) || at > n) return null;
      const first = ring[0] ? Number(ring[0].id.split("-")[1]) : n + 1;
      if (at < first - 1) return null;
      return ring.filter((e) => Number(e.id.split("-")[1]) > at && topics(e.topic));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stats: () => ({ epoch, published: n, held: ring.length, listeners: listeners.size }),
  };
}
