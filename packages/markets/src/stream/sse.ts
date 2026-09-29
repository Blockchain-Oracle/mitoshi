/**
 * A Server-Sent Events reader over `fetch` streaming (D-049): the browser's `EventSource` can't send headers and Node
 * and React Native have none, so one reader serves every runtime. Implements the SSE framing (`event:`, `data:`, `id:`,
 * `retry:`, comments) and reconnects with `Last-Event-ID` so the ops bus replays what was missed (its ring), else sends
 * each topic's snapshot again.
 */

export interface SseMessage {
  event: string;
  data: string;
  id: string | null;
}

/** Splits a text chunk stream into SSE messages (pure; carries partial lines between chunks). */
export function createSseParser(onMessage: (m: SseMessage) => void, onRetry?: (ms: number) => void) {
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  let id: string | null = null;
  const dispatch = () => {
    if (data.length > 0) onMessage({ event, data: data.join("\n"), id });
    event = "message";
    data = [];
  };
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r\n|\n|\r/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") {
        dispatch();
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "id") id = value;
      else if (field === "retry" && /^\d+$/.test(value)) onRetry?.(Number(value));
    }
  };
}

export interface SseConnection {
  close(): void;
}

export interface SseOptions {
  url: string;
  onMessage: (m: SseMessage) => void;
  onStatus?: (status: "open" | "reconnecting" | "closed", detail?: string) => void;
  fetcher?: typeof fetch;
  /** First reconnect delay; the server's `retry:` overrides it. */
  retryMs?: number;
}

/** Opens and keeps open one stream until `close()`. */
export function connectSse(opts: SseOptions): SseConnection {
  const fetcher = opts.fetcher ?? fetch;
  let closed = false;
  let lastId: string | null = null;
  let retryMs = opts.retryMs ?? 3_000;
  let controller: AbortController | null = null;
  const run = async () => {
    while (!closed) {
      controller = new AbortController();
      try {
        const res = await fetcher(opts.url, { headers: { accept: "text/event-stream", ...(lastId ? { "last-event-id": lastId } : {}) }, signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`stream answered ${res.status}`);
        opts.onStatus?.("open");
        const parse = createSseParser((m) => {
          if (m.id) lastId = m.id;
          opts.onMessage(m);
        }, (ms) => (retryMs = ms));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          parse(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        if (closed) break;
        opts.onStatus?.("reconnecting", error instanceof Error ? error.message : String(error));
      }
      if (!closed) await new Promise((r) => setTimeout(r, retryMs));
    }
    opts.onStatus?.("closed");
  };
  void run();
  return {
    close() {
      closed = true;
      controller?.abort();
    },
  };
}
