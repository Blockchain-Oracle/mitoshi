/**
 * The one HTTP server on 8080 (plan C.5.1, D-032): `/health`, `/session`, `/prices/{latest,history}` and the D-049
 * stream `/v1/stream` (served as `stream.<domain>`), GET only. Price and stream routes answer exact-origin CORS without
 * credentials. Ported in shape from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/http/server.ts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Sql } from "@cwf/db";
import type { SessionService } from "../calendar/session-service";
import type { SpotFeed } from "../prices/spot";
import type { Bus } from "../runtime/bus";
import { errorText, type OpsEnv } from "../runtime/env";
import type { HaltBoardStore } from "../runtime/halt-board";
import type { SessionEvents } from "../runtime/session-events";
import { healthBody, jsonText } from "./health";
import { historyBody, latestBody } from "./prices";
import { sessionBody } from "./session";
import { corsHeaders, serveStream, type Snapshot } from "./stream";

export interface HttpInputs {
  env: OpsEnv;
  sql: Sql | null;
  spot: SpotFeed | null;
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
    if (req.method === "OPTIONS") return void res.writeHead(204, cors).end();
    if (req.method !== "GET") return json(405, { error: "GET only" });
    switch (url.pathname) {
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
      input.log(`http on :${input.env.httpPort} (/health, /session, /prices/latest, /prices/history, /v1/stream)`);
      resolve({ close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
