/** The one HTTP server on 8080 (plan C.5.1). S0 serves `/health`; later stages add `/session`, `/v1/stream`, … */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { heartbeats } from "../runtime";

type Route = (req: IncomingMessage, res: ServerResponse) => void;

const SILENT_FLOOR_MS = 5 * 60_000;

function health(_req: IncomingMessage, res: ServerResponse): void {
  const now = Date.now();
  const actors = heartbeats().map((b) => {
    const silentAfter = Math.max(SILENT_FLOOR_MS, 3 * b.everyMs);
    const silent = b.lastOkMs === null ? now - b.startedMs > silentAfter : now - b.lastOkMs > silentAfter;
    return { ...b, silent };
  });
  const ok = actors.every((a) => !a.silent);
  res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ ok, nowMs: now, commit: process.env.FLY_IMAGE_REF ?? process.env.GIT_SHA ?? null, actors }));
}

export function startHttp(port: number, extra: Record<string, Route> = {}): void {
  const routes: Record<string, Route> = { "/health": health, ...extra };
  createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://ops").pathname;
    const route = routes[path];
    if (route) return route(req, res);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }).listen(port, () => console.log(`[ops] http listening on :${port}`));
}
