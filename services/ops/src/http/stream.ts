/**
 * `GET /v1/stream?topics=…` (D-049; plan S3 "spot/stream"): one multiplexed SSE per client on `stream.<domain>`.
 * Public topics are open; `user:<address>` needs a 60 s HMAC ticket (`?ticket=`, EventSource can't send headers)
 * minted by the web from a session. Exact-origin CORS without credentials; `: ping` every 15 s; `Last-Event-ID`
 * (header or `?lastEventId=`) replays from the bus ring, else each topic's snapshot is sent first; an ephemeral topic
 * (`ticks`) always opens on its snapshot, since its events never enter the ring.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyStreamTicket } from "@cwf/markets/stream-ticket";
import type { Bus, BusEvent } from "../runtime/bus";

export const PING_MS = 15_000;
const MAX_TOPICS = 32;
/** Public topic names (`ticks`: the display feed, S23a, never replayed); `market:<0x…32 bytes>` and `symbol:<TICKER>` are parameterised. */
const PUBLIC = new Set(["prices", "ticks", "markets", "fills", "prints", "verdicts", "halts", "session", "activity", "rooms", "takes", "strategies", "launches"]);

/** Topics published with `bus.emit` (never in the replay ring): a replaying client still gets their snapshot. */
const EPHEMERAL = new Set(["ticks"]);

export type Snapshot = (topic: string) => Promise<Array<{ event: string; data: unknown }>>;

export interface TopicGrant {
  topics: string[];
  error: string | null;
}

/** Parses and authorizes `topics` (+ `ticket`); pure so it is tested without a socket. */
export function grantTopics(raw: string | null, ticket: string | null, secret: string | null, nowSec: number): TopicGrant {
  const topics = [...new Set((raw ?? "").split(",").map((t) => t.trim()).filter(Boolean))];
  if (topics.length === 0) return { topics, error: "topics required" };
  if (topics.length > MAX_TOPICS) return { topics, error: `at most ${MAX_TOPICS} topics` };
  const user = ticket && secret ? verifyStreamTicket(secret, ticket, nowSec) : null;
  for (const t of topics) {
    if (PUBLIC.has(t) || /^market:0x[0-9a-f]{64}$/.test(t) || /^symbol:[A-Z]{2,6}$/.test(t) || /^launch:0x[0-9a-f]{40}$/.test(t)) continue;
    const m = /^user:(0x[0-9a-fA-F]{40})$/.exec(t);
    if (!m) return { topics, error: `unknown topic ${t}` };
    if (!secret) return { topics, error: "per-user topics are not enabled on this deployment" };
    if (user !== m[1]!.toLowerCase()) return { topics, error: `topic ${t} needs a valid ticket for that address` };
  }
  return { topics: topics.map((t) => (t.startsWith("user:") ? t.toLowerCase() : t)), error: null };
}

export function corsHeaders(origin: string | undefined, allowed: readonly string[]): Record<string, string> {
  const base = { vary: "Origin", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "last-event-id" };
  return origin && allowed.includes(origin) ? { ...base, "access-control-allow-origin": origin } : base;
}

const frame = (e: { id?: string; event: string; topic: string; data: unknown }) =>
  `${e.id ? `id: ${e.id}\n` : ""}event: ${e.event}\ndata: ${JSON.stringify({ topic: e.topic, data: e.data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}\n\n`;

export async function serveStream(req: IncomingMessage, res: ServerResponse, input: { bus: Bus; snapshot: Snapshot; secret: string | null; cors: Record<string, string> }): Promise<void> {
  const url = new URL(req.url ?? "/", "http://ops");
  const grant = grantTopics(url.searchParams.get("topics"), url.searchParams.get("ticket"), input.secret, Math.floor(Date.now() / 1000));
  if (grant.error) {
    res.writeHead(grant.error.includes("ticket") ? 401 : 400, { ...input.cors, "content-type": "application/json", "cache-control": "no-store" });
    return void res.end(JSON.stringify({ error: grant.error }));
  }
  const wanted = new Set(grant.topics);
  const matches = (topic: string) => wanted.has(topic);
  res.writeHead(200, { ...input.cors, "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  res.write(`retry: 3000\n\n`);
  const lastId = (req.headers["last-event-id"] as string | undefined) ?? url.searchParams.get("lastEventId");
  const replay = lastId ? input.bus.since(lastId, matches) : null;
  // Buffer live events while the snapshot is read, so nothing published meanwhile is lost.
  const pending: BusEvent[] = [];
  let live = false;
  const unsubscribe = input.bus.subscribe((e) => {
    if (!matches(e.topic)) return;
    if (live) res.write(frame(e));
    else pending.push(e);
  });
  if (replay) for (const e of replay) res.write(frame(e));
  for (const topic of grant.topics) {
    if (replay && !EPHEMERAL.has(topic)) continue;
    for (const s of await input.snapshot(topic).catch(() => [])) res.write(frame({ topic, ...s }));
  }
  for (const e of pending) res.write(frame(e));
  live = true;
  const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);
  req.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });
}
