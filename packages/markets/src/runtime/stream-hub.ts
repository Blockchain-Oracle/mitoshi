/**
 * The page's ONE stream connection (D-040/D-049), shared by every component: a lazily created `StreamClient` whose
 * batches are fanned out by topic to subscribers. Framework-free and light (no viem), exposed as
 * `@cwf/markets/stream` so the shell's ticker can use it on site pages too. `configureStream` is called once with the
 * ops stream URL (null keeps everything idle: nothing connects and subscribers simply never hear anything).
 */
import { createStreamClient, documentVisibility, type StreamClient, type StreamEvent, type StreamState, type StreamVisibility } from "./stream";

export type { StreamEvent, StreamState } from "./stream";

type Listener = (events: StreamEvent[]) => void;

let config: { url: string | null; ticket?: () => Promise<string | null> } = { url: null };
let client: StreamClient | null = null;
const listeners = new Map<string, Set<Listener>>();
const stateListeners = new Set<(s: StreamState) => void>();
/** Whether the last connection that asked for a `user:` topic got its ticket (null: none asked yet). */
let userGrant: boolean | null = null;
const grantListeners = new Set<(granted: boolean | null) => void>();
let everOpen = false;

/**
 * The price topics' latest event per symbol, for a subscriber that joins a topic the connection already carries: the
 * server sends a topic's snapshot only when the connection opens with it, so a late joiner (the price cache mounting
 * after the ticker) heard nothing until the next signed print — up to 20 s of "Reading the price…" on a cold app
 * (2026-10-14). Only these topics: a fill or a notification must never be replayed to a new listener.
 */
const LATEST_TOPICS: ReadonlySet<string> = new Set(["prices", "ticks"]);
const latestByTopic = new Map<string, Map<string, StreamEvent>>();

function keyOf(e: StreamEvent): string | null {
  const symbol = (e.data as { symbol?: unknown } | null)?.symbol;
  return typeof symbol === "string" ? `${e.event}:${symbol}` : null;
}

function remember(topic: string, events: readonly StreamEvent[]): void {
  if (!LATEST_TOPICS.has(topic)) return;
  let held = latestByTopic.get(topic);
  if (!held) latestByTopic.set(topic, (held = new Map()));
  for (const e of events) {
    const key = keyOf(e);
    if (key) held.set(key, e);
  }
}

/** Test seam: forget the remembered price events. */
export function resetStreamMemory(): void {
  latestByTopic.clear();
}

export function configureStream(next: { url: string | null; ticket?: () => Promise<string | null> }): void {
  if (next.url === config.url) return void (config = next);
  client?.close();
  client = null;
  config = next;
}

/**
 * Holds that keep the stream open while the page is hidden (S23e): an armed trail must keep hearing its price with the
 * tab in the background. Without a hold the stream pauses on a hidden page as before (AD-6).
 */
let awakeHolds = 0;
const awakeListeners = new Set<() => void>();

function heldVisibility(): StreamVisibility | null {
  const doc = documentVisibility();
  if (!doc) return null;
  return {
    hidden: () => awakeHolds === 0 && doc.hidden(),
    subscribe: (onChange) => {
      awakeListeners.add(onChange);
      const off = doc.subscribe(onChange);
      return () => {
        awakeListeners.delete(onChange);
        off();
      };
    },
  };
}

/** Keep the stream open while the page is hidden until the returned release runs. */
export function holdStreamAwake(): () => void {
  awakeHolds += 1;
  awakeListeners.forEach((l) => l());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    awakeHolds -= 1;
    awakeListeners.forEach((l) => l());
  };
}

function hub(): StreamClient | null {
  if (!config.url) return null;
  client ??= createStreamClient({
    url: config.url,
    visibility: heldVisibility(),
    ...(config.ticket ? { ticket: config.ticket } : {}),
    onBatch: (events) => {
      const byTopic = new Map<string, StreamEvent[]>();
      for (const e of events) byTopic.set(e.topic, [...(byTopic.get(e.topic) ?? []), e]);
      for (const [topic, list] of byTopic) {
        remember(topic, list);
        for (const l of listeners.get(topic) ?? []) l(list);
      }
    },
    onState: (s) => {
      if (s === "open") everOpen = true;
      stateListeners.forEach((l) => l(s));
    },
    onUserGrant: (granted) => {
      if (granted === userGrant) return;
      userGrant = granted;
      grantListeners.forEach((l) => l(granted));
    },
  });
  return client;
}

/** Listen to one topic; the shared connection opens with the first listener and drops the topic with the last. */
export function subscribeTopic(topic: string, listener: Listener): () => void {
  const c = hub();
  if (!c) return () => undefined;
  let set = listeners.get(topic);
  if (!set) listeners.set(topic, (set = new Set()));
  set.add(listener);
  const release = c.subscribe(topic);
  // A topic already flowing: hand this listener what the connection has heard so far (each symbol's latest), next tick.
  const held = latestByTopic.get(topic);
  if (held && held.size > 0) {
    const replay = [...held.values()];
    queueMicrotask(() => {
      if (set!.has(listener)) listener(replay);
    });
  }
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(topic);
    release();
  };
}

/** Whether the stream has opened at least once in this tab: before that a quiet line is connecting, after it reconnecting. */
export function streamEverOpened(): boolean {
  return everOpen;
}

export function streamState(): StreamState {
  return client?.state() ?? (config.url ? "idle" : "closed");
}

export function subscribeStreamState(listener: (s: StreamState) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** Whether the stream carries the signed-in user's own topic (false: no ticket — follow the chain instead, D-151). */
export function userStreamGranted(): boolean | null {
  return userGrant;
}

export function subscribeUserGrant(listener: (granted: boolean | null) => void): () => void {
  grantListeners.add(listener);
  return () => grantListeners.delete(listener);
}

/** A price tick on the `prices` / `symbol:<T>` topics (services/ops `wireTick`). */
export interface PriceTick {
  symbol: string;
  priceE8: string;
  publishTimeSec: number;
  source: string;
  signers: number;
}

export function isPriceTick(v: unknown): v is PriceTick {
  const t = v as PriceTick;
  return typeof t?.symbol === "string" && typeof t.priceE8 === "string" && /^\d+$/.test(t.priceE8) && typeof t.publishTimeSec === "number";
}
