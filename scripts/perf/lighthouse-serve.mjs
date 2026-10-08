/**
 * Serves a branch build to Lighthouse the way production serves it (`lighthouse.yml`, `ref` mode; plan §3.1): one
 * origin, `http://localhost:3000` (the origin the ops/stream CORS list already allows), where `/api/index/*` is the
 * live testnet index — public GET reads only, no cookie or auth forwarded — and every other path is `next start` on
 * APP_UPSTREAM. Production's pages read the index same-origin (`NEXT_PUBLIC_INDEX_URL` unset → `/api/index`), so the
 * page under test runs the same code against the same data without a CORS allowance on the deployed index.
 *
 *   APP_UPSTREAM=http://127.0.0.1:3001 INDEX_UPSTREAM=https://testnet.mitoshi.xyz PORT=3000 node scripts/perf/lighthouse-serve.mjs
 */
import http from "node:http";
import https from "node:https";

const port = Number(process.env.PORT ?? 3000);
const app = new URL(process.env.APP_UPSTREAM ?? "http://127.0.0.1:3001");
const index = new URL(process.env.INDEX_UPSTREAM ?? "https://testnet.mitoshi.xyz");
const agents = { "http:": new http.Agent({ keepAlive: true }), "https:": new https.Agent({ keepAlive: true }) };
const PRIVATE = ["cookie", "authorization"];

http
  .createServer((req, res) => {
    const url = req.url ?? "/";
    const toIndex = url.startsWith("/api/index/");
    if (toIndex && req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    const target = toIndex ? index : app;
    const headers = { ...req.headers, host: target.host };
    if (toIndex) for (const name of PRIVATE) delete headers[name];
    const lib = target.protocol === "https:" ? https : http;
    const upstream = lib.request(
      { protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method, path: url, headers, agent: agents[target.protocol] },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on("error", (error) => {
      console.error(`[serve] ${req.method} ${url}: ${error.message}`);
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(port, () => console.log(`[serve] :${port} → app ${app.origin}, /api/index → ${index.origin}`));
