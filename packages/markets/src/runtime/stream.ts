/**
 * The real-time client (plan S1 1b, D-040/D-049): ONE multiplexed SSE connection to the ops stream
 * (`<streamUrl>/v1/stream?topics=…`), shared by every subscriber. Topics are reference-counted; a change of the topic
 * set reconnects once (debounced) and resumes from the last event id, so nothing is lost across it. Per-user topics
 * (`user:<address>`) carry a 60 s ticket minted by `/api/stream/ticket`. The connection closes while the page is
 * hidden and resumes (with replay) when it is shown again. Messages are delivered in one batch per frame.
 *
 * Wire (services/ops `http/stream.ts`): `event: <name>` + `data: {"topic": …, "data": …}`, ids for replay, `: ping`
 * every 15 s, `retry:` hint.
 */
import { createFrameBatcher } from "./frame-batch";
import { createSseParser } from "./sse";

export interface StreamEvent {
  id: string | null;
  event: string;
  topic: string;
  data: unknown;
}

export type StreamState = "idle" | "connecting" | "open" | "paused" | "retrying" | "closed";

export interface StreamVisibility {
  hidden(): boolean;
  subscribe(onChange: () => void): () => void;
}

export interface StreamClientOptions {
  /** Base of the ops stream, e.g. `https://stream.mitoshi.xyz`. */
  url: string;
  /** Mints a ticket for per-user topics; null when signed out (per-user topics are then dropped). */
  ticket?: () => Promise<string | null>;
  onBatch: (events: StreamEvent[]) => void;
  onState?: (state: StreamState) => void;
  fetch?: typeof fetch;
  visibility?: StreamVisibility | null;
  schedule?: (run: () => void) => void;
  /** Topic-set changes within this window reconnect once. */
  debounceMs?: number;
}

/** The page's visibility, typed structurally so non-DOM packages that typecheck this module need no DOM lib. */
type VisibilityDoc = { visibilityState: string; addEventListener(type: string, f: () => void): void; removeEventListener(type: string, f: () => void): void };

export function documentVisibility(): StreamVisibility | null {
  const doc = (globalThis as { document?: VisibilityDoc }).document;
  if (!doc) return null;
  return {
    hidden: () => doc.visibilityState === "hidden",
    subscribe: (onChange) => {
      doc.addEventListener("visibilitychange", onChange);
      return () => doc.removeEventListener("visibilitychange", onChange);
    },
  };
}

export interface StreamClient {
  subscribe(topic: string): () => void;
  state(): StreamState;
  close(): void;
}

export function createStreamClient(options: StreamClientOptions): StreamClient {
  const doFetch = options.fetch ?? fetch;
  const visibility = options.visibility === undefined ? documentVisibility() : options.visibility;
  const batcher = createFrameBatcher<StreamEvent>(options.onBatch, options.schedule);
  const counts = new Map<string, number>();
  let state: StreamState = "idle";
  let controller: AbortController | null = null;
  let lastEventId: string | null = null;
  let retryMs = 3_000;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const setState = (next: StreamState) => {
    if (state === next) return;
    state = next;
    options.onState?.(next);
  };

  const stop = () => {
    controller?.abort();
    controller = null;
  };

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, ms);
  };

  async function connect(): Promise<void> {
    stop();
    if (closed) return;
    const topics = [...counts.keys()].sort();
    if (topics.length === 0) return setState("idle");
    if (visibility?.hidden()) return setState("paused");
    const wantsUser = topics.some((t) => t.startsWith("user:"));
    const ticket = wantsUser && options.ticket ? await options.ticket().catch(() => null) : null;
    const granted = wantsUser && !ticket ? topics.filter((t) => !t.startsWith("user:")) : topics;
    if (granted.length === 0) return setState("idle");
    const params = new URLSearchParams({ topics: granted.join(",") });
    if (ticket) params.set("ticket", ticket);
    if (lastEventId) params.set("lastEventId", lastEventId);
    const mine = new AbortController();
    controller = mine;
    setState(failures > 0 ? "retrying" : "connecting");
    try {
      const res = await doFetch(`${options.url.replace(/\/$/, "")}/v1/stream?${params}`, { signal: mine.signal, headers: { accept: "text/event-stream" }, cache: "no-store" });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      setState("open");
      failures = 0;
      const parser = createSseParser(
        (m) => {
          if (m.id) lastEventId = m.id;
          try {
            const { topic, data } = JSON.parse(m.data) as { topic: string; data: unknown };
            batcher.push({ id: m.id, event: m.event, topic, data });
          } catch {
            // A frame that isn't our envelope is ignored, never guessed at.
          }
        },
        (ms) => (retryMs = ms),
      );
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(value);
      }
      throw new Error("stream ended");
    } catch {
      if (mine.signal.aborted || closed || controller !== mine) return;
      failures += 1;
      setState("retrying");
      schedule(Math.min(30_000, retryMs * 2 ** Math.min(failures - 1, 4)));
    }
  }

  const unwatch = visibility?.subscribe(() => {
    if (visibility.hidden()) {
      stop();
      if (counts.size) setState("paused");
    } else if (counts.size) schedule(0);
  });

  return {
    subscribe(topic) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
      if (counts.get(topic) === 1) schedule(options.debounceMs ?? 50);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const n = (counts.get(topic) ?? 1) - 1;
        if (n > 0) return void counts.set(topic, n);
        counts.delete(topic);
        schedule(options.debounceMs ?? 50);
      };
    },
    state: () => state,
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      unwatch?.();
      stop();
      setState("closed");
    },
  };
}
