/**
 * The one HTTP server on 8080 (plan C.5.1, D-032): `/health`, `/session`, `/prices/{latest,history}`, the display feed's
 * `/prices/{recent,candles,day}` (S23a, D-196: the chart's line, never a settling value) and the D-049
 * stream `/v1/stream` (served as `stream.<domain>`), GET only. Price and stream routes answer exact-origin CORS without
 * credentials. A request to a retired name (`ops.testnet.`, `stream.testnet.`; D-228) is redirected to the current one, except a
 * browser's cross-origin read, which is served in place. Ported in shape from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/http/server.ts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { boardBody, MAX_IDS, windowsBody } from "../actors/board-cache";
import type { Sql } from "@cwf/db";
import { indexReader } from "@cwf/db/idx";
import { isTickerSymbol, movedHost, NETWORKS, X_RELAY_STOPPED, type XRelayStatus } from "@cwf/core";
import type { SessionService } from "../calendar/session-service";
import type { DisplayRuntime } from "../display/runtime";
import type { SpotFeed } from "../prices/spot";
import type { Bus } from "../runtime/bus";
import { errorText, type OpsEnv } from "../runtime/env";
import type { HaltBoardStore } from "../runtime/halt-board";
import type { SessionEvents } from "../runtime/session-events";
import { healthBody, jsonText } from "./health";
import { heartbeats } from "../runtime/heartbeat";
import { historyBody, latestBody } from "./prices";
import { sessionBody } from "./session";
import { corsHeaders, serveStream, type Snapshot } from "./stream";

export interface HttpInputs {
  env: OpsEnv;
  sql: Sql | null;
  spot: SpotFeed | null;
  /** The chart line's feed (S23a); null when this process runs none. */
  display: DisplayRuntime | null;
  sessions: SessionService | null;
  halts: HaltBoardStore | null;
  events: SessionEvents | null;
  bus: Bus;
  snapshot: Snapshot;
  redstoneSigners: ReadonlySet<string>;
  log: (why: string) => void;
}

export function startHttp(input: HttpInputs): Promise<{ close(): Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://ops");
    const cors = corsHeaders(req.headers.origin, input.env.corsOrigins);
    const json = (status: number, body: unknown, cache = "no-store") => {
      res.writeHead(status, { ...cors, "content-type": "application/json", "cache-control": cache });
      res.end(jsonText(body));
    };
    const fail = (error: unknown) => json(503, { error: errorText(error) });
    // A preflight is answered where it lands: browsers never follow a redirect on one.
    if (req.method === "OPTIONS") return void res.writeHead(204, cors).end();
    // The retired names (D-228): ops.testnet. and stream.testnet. send each request to the same path on ops. and stream.
    // A browser's cross-origin read (an EventSource, a fetch) carries Origin and is served where it lands: a browser
    // following a redirect to another origin sends `Origin: null`, which no allow-list names, so a tab opened on the old
    // web before the move would lose its prices and stream.
    const moved = req.headers.origin ? null : movedHost(req.headers.host ?? "");
    if (moved) {
      const status = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
      return void res.writeHead(status, { ...cors, location: `https://${moved}${url.pathname}${url.search}`, "cache-control": "public, max-age=3600" }).end();
    }
    if (req.method !== "GET") return json(405, { error: "GET only" });
    switch (url.pathname) {
      // Liveness for the container check (Coolify): the process serves. `/health` stays the strict readiness view — a
      // RedStone outage fails it (critical actors), and as the container check that took the whole API off the proxy.
      case "/livez":
        return json(200, { ok: true, nowMs: Date.now() });
      case "/health": {
        const body = healthBody(input.env);
        return json(body.ok ? 200 : 503, { ...body, stream: input.bus.stats() });
      }
      case "/session":
        return json(200, sessionBody({ sessions: input.sessions, halts: input.halts, events: input.events }), "public, max-age=5");
      case "/prices/latest":
        return void latestBody(input.spot, input.sql, input.redstoneSigners).then((b) => json(200, b, "public, max-age=2"), fail);
      case "/prices/history": {
        const symbol = url.searchParams.get("symbol") ?? "";
        const from = Number(url.searchParams.get("from"));
        const to = Number(url.searchParams.get("to") ?? Math.floor(Date.now() / 1000));
        if (!/^[A-Z]{2,6}(-24)?$/.test(symbol) || !Number.isInteger(from) || !Number.isInteger(to) || to < from) return json(400, { error: "symbol, from, to required (unix seconds)" });
        if (!input.sql) return json(503, { error: "no database" });
        return void historyBody(input.sql, symbol, from, to).then((rows) => json(200, { rows }, "public, max-age=10"), fail);
      }
      case "/prices/recent": {
        // The display line's last half hour, one sample a second, to seed a chart before the first `ticks` frame.
        const symbol = url.searchParams.get("symbol") ?? "";
        if (!isTickerSymbol(symbol)) return json(400, { error: "symbol=<ticker> required" });
        if (!input.display) return json(503, { error: "no display feed in this process" });
        return json(200, { symbol, points: input.display.recent.points(symbol) }, "public, max-age=1");
      }
      case "/prices/candles": {
        if (!input.display) return json(503, { error: "no display feed in this process" });
        const count = url.searchParams.get("count");
        const end = url.searchParams.get("endMs");
        return void input.display.candles({ symbol: url.searchParams.get("symbol") ?? "", interval: url.searchParams.get("interval") ?? "1m", ...(count ? { count: Number(count) } : {}), ...(end ? { endMs: Number(end) } : {}) }).then((r) => json(r.status, r.body, r.status === 200 ? "public, max-age=10" : "no-store"), fail);
      }
      case "/prices/day":
        if (!input.display) return json(503, { error: "no display feed in this process" });
        return void input.display.day().then((b) => json(200, b, "public, max-age=30"), fail);
      case "/index/recount": {
        // Public chain data only: what the index holds at or below a block, for `scripts/drive/recount.ts`.
        const through = Number(url.searchParams.get("through"));
        if (!Number.isInteger(through) || through <= 0) return json(400, { error: "through=<block> required" });
        if (!input.sql) return json(503, { error: "no database" });
        const reader = indexReader(input.sql);
        const chainId = NETWORKS[input.env.network];
        return void Promise.all([reader.countsThrough(chainId, through), reader.marketDigest(chainId, through), reader.status()]).then(([counts, markets, status]) => json(200, { chainId, through, counts, markets, cursors: status.cursors }), fail);
      }
      case "/halts/log": {
        // halt-watch's recorded observations (public source-health data) for `scripts/drive/halt-replay.ts`, in write order:
        // `order by id` would sort the `id::text` output column as text (1, 10 … 19, 2, 20 …) and break the replay (D-186).
        const from = Number(url.searchParams.get("from") ?? 0);
        const to = Number(url.searchParams.get("to") ?? Math.floor(Date.now() / 1000));
        if (!input.sql) return json(503, { error: "no database" });
        return void input.sql`select id::text, pass_sec::text, in_hours, observed, confirmed, fixture from halt_log where pass_sec between ${from} and ${to} order by halt_log.id limit 20000`.then((rows) => json(200, { rows }), fail);
      }
      case "/exits/keeper": {
        // The address an owner's EXIT grant names (S24.5): the running exit keeper's role key, or null when none runs.
        const beat = heartbeats().find((h) => h.actor === "exit-keeper");
        const d = (beat?.detail ?? {}) as { keeper?: string; vault?: string | null };
        const live = !!beat && !beat.dryRun && !!d.keeper && d.keeper !== "0x0000000000000000000000000000000000000000";
        return json(200, { keeper: live ? d.keeper : null, vault: d.vault ?? null }, "public, max-age=30");
      }
      case "/x/relay": {
        // S11 (D-227): the x-relay's own account of itself — the executor an EXECUTOR grant must name, how it reads
        // mentions (or why it can't), dry or live, posting or not. Public facts only; the web's /api/x/status reads it.
        const beat = heartbeats().find((h) => h.actor === "x-relay");
        const status = (beat?.detail as { status?: XRelayStatus } | undefined)?.status;
        return json(200, status ? { ...status, updatedAtMs: beat?.lastOkMs ?? beat?.lastPassMs ?? null, lastWhy: beat?.lastWhy ?? null } : X_RELAY_STOPPED, "no-store");
      }
      // R6 S04: the shared board (the board-cache actor's memory; never a chain read per request).
      case "/v1/board":
      case "/v1/windows": {
        let body: { text: string; etag: string } | null;
        if (url.pathname === "/v1/board") body = boardBody();
        else {
          const ids = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => /^0x[0-9a-fA-F]{64}$/.test(id))) return json(400, { error: `ids=<0x… 32-byte Window ids>, at most ${MAX_IDS}` });
          body = windowsBody(ids);
        }
        if (!body) return json(503, { error: "no board in this process yet" });
        return sendBoard(req, res, cors, body);
      }
      case "/v1/stream":
        return void serveStream(req, res, { bus: input.bus, snapshot: input.snapshot, secret: input.env.streamTicketSecret, cors }).catch((e) => input.log(`stream: ${errorText(e)}`));
      default:
        return json(404, { error: "not found" });
    }
  });
  server.keepAliveTimeout = 65_000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.env.httpPort, () => {
      input.log(`http on :${input.env.httpPort} (/health, /session, /prices/{latest,history,recent,candles,day}, /v1/stream)`);
      resolve({ close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

/** A board body with its ETag (304 on a match) and gzip when the client takes it — `/v1/board` is ~100 KB of JSON. */
const zipped = new Map<string, Buffer>();
function sendBoard(req: IncomingMessage, res: ServerResponse, cors: Record<string, string>, body: { text: string; etag: string }): void {
  const head = { ...cors, "content-type": "application/json", "cache-control": "public, max-age=1, stale-while-revalidate=10", etag: body.etag, vary: "Origin, Accept-Encoding" };
  if (req.headers["if-none-match"] === body.etag) return void res.writeHead(304, head).end();
  if (body.text.length > 1_024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    let gz = zipped.get(body.etag);
    if (!gz) {
      gz = gzipSync(body.text);
      zipped.clear();
      zipped.set(body.etag, gz);
    }
    return void res.writeHead(200, { ...head, "content-encoding": "gzip" }).end(gz);
  }
  res.writeHead(200, head).end(body.text);
}
