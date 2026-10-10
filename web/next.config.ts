import type { NextConfig } from "next";
import { DOCS_URL, docsUrl } from "./src/lib/docs-url";

/**
 * Plan D-050 (D41): cached rendering, the React Compiler, partial prefetching, and no agent files written by
 * `next dev`. Legacy routes redirect with `?note=moved` so the destination can say why (ux-audit fix 14; L-21).
 */
const moved = (source: string, destination: string) => ({ source, destination: `${destination}${destination.includes("?") ? "&" : "?"}note=moved`, permanent: false });

const config: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  agentRules: false,
  partialPrefetching: true,
  devIndicators: false,
  // Diagnosis only (plan §3.1): `ANALYZE_MAPS=1 pnpm build` emits browser source maps for `scripts/perf/attribute.ts`.
  productionBrowserSourceMaps: process.env.ANALYZE_MAPS === "1",
  transpilePackages: ["@cwf/core", "@cwf/markets", "@cwf/clients", "@cwf/tokens", "@cwf/db"],
  // Only Mitoshi frames Mitoshi (the landing's phone runs the terminal in a frame): no other site can frame the app and
  // lay its own button over a trade (clickjacking). `frame-ancestors` is the standard successor to X-Frame-Options.
  headers: async () => [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] }],
  redirects: async () => [
    moved("/markets-live", "/markets"),
    moved("/bell", "/markets"),
    moved("/beta", "/markets"),
    moved("/pool", "/earn"),
    moved("/tickers/:symbol", "/stocks/:symbol"),
    { source: "/docs", destination: DOCS_URL, permanent: false },
    { source: "/docs/:path*", destination: docsUrl(":path*"), permanent: false },
  ],
};

export default config;
