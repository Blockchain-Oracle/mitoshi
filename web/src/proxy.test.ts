// The docs are their own site (D-230): every `/docs` path reaches the proxy whatever it ends in — the real matcher, as
// Next compiles it — and the proxy answers a 308 to the docs site, never the app's 404. Static payloads elsewhere still
// skip the proxy.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { DOCS_URL } from "./lib/docs-url";
import { config, proxy } from "./proxy";

const ORIGIN = "https://mitoshi.xyz";
const matches = (path: string) => unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` });
const answer = (path: string) => proxy(new NextRequest(`${ORIGIN}${path}`, { headers: { host: "mitoshi.xyz" } }));

describe("proxy matcher", () => {
  it("runs on /docs and every /docs/* path, extensions included", () => {
    for (const path of ["/docs", "/docs/", "/docs/record", "/docs/trading/fees", "/docs/llms.txt", "/docs/start/install.json", "/docs/x.png", "/docs/a/b/c.svg"]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("still skips static payloads elsewhere, and runs on pages", () => {
    expect(matches("/icon-192.png")).toBe(false);
    expect(matches("/_next/static/chunks/app.js")).toBe(false);
    expect(matches("/manifest.webmanifest")).toBe(false);
    expect(matches("/download")).toBe(true);
    expect(matches("/docsify")).toBe(true);
  });
});

describe("proxy on /docs", () => {
  it("answers a 308 to the docs site for every /docs path", () => {
    const cases: [string, string][] = [
      ["/docs", DOCS_URL],
      ["/docs/record", `${DOCS_URL}/explore/record`],
      ["/docs/trading/fees", `${DOCS_URL}/trading/fees`],
      ["/docs/llms.txt", `${DOCS_URL}/llms.txt`],
      ["/docs/start/install.json", DOCS_URL],
      ["/docs/x.png", DOCS_URL],
    ];
    for (const [path, to] of cases) {
      const res = answer(path);
      expect(res.status, path).toBe(308);
      expect(new URL(res.headers.get("location") ?? "").toString(), path).toBe(new URL(to).toString());
    }
  });

  it("leaves /download to the app", () => {
    const res = answer("/download");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
