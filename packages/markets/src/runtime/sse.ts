/**
 * A server-sent-events parser (WHATWG "event stream" interpretation) over text chunks: `id:`, `event:`, multi-line
 * `data:`, `retry:`, comments. Used by the stream client, which reads SSE over `fetch` rather than `EventSource` so it
 * can resume with `Last-Event-ID` on any reconnect, pause while hidden, and run in Node for tests (D-040/D-049).
 */
export interface SseMessage {
  id: string | null;
  event: string;
  data: string;
}

export function createSseParser(onMessage: (m: SseMessage) => void, onRetry?: (ms: number) => void) {
  let buffer = "";
  let data: string[] = [];
  let event = "";
  let id: string | null = null;
  let lastId: string | null = null;

  const dispatch = () => {
    if (data.length > 0) onMessage({ id: id ?? lastId, event: event || "message", data: data.join("\n") });
    if (id !== null) lastId = id;
    data = [];
    event = "";
    id = null;
  };

  const line = (raw: string) => {
    if (raw === "") return dispatch();
    if (raw.startsWith(":")) return;
    const colon = raw.indexOf(":");
    const field = colon < 0 ? raw : raw.slice(0, colon);
    let value = colon < 0 ? "" : raw.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    else if (field === "id" && !value.includes("\0")) id = value;
    else if (field === "retry" && /^\d+$/.test(value)) onRetry?.(Number(value));
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let at: number;
      while ((at = buffer.search(/\r\n|\r|\n/)) >= 0) {
        const nl = buffer[at] === "\r" && buffer[at + 1] === "\n" ? 2 : 1;
        line(buffer.slice(0, at));
        buffer = buffer.slice(at + nl);
      }
    },
    /** The last event id seen (for `Last-Event-ID` on reconnect). */
    lastEventId: () => lastId,
  };
}
