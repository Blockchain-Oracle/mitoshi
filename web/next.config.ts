import type { NextConfig } from "next";

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
  // mppx's server (the Memory Market's paid read, S9.9b) runs from node_modules, unbundled: its MCP transport imports an
  // optional peer (`@modelcontextprotocol/sdk`) that this app doesn't install and never calls.
  serverExternalPackages: ["mppx"],
  // Only Mitoshi frames Mitoshi (the landing's phone runs the terminal in a frame): no other site can frame the app and
  // lay its own button over a trade (clickjacking). `frame-ancestors` is the standard successor to X-Frame-Options.
  headers: async () => [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] }],
  redirects: async () => [
    moved("/markets-live", "/markets"),
    moved("/bell", "/markets"),
    moved("/beta", "/markets"),
    moved("/pool", "/earn"),
    // D-226: no Stocks section — the listed stocks trade in Markets' 24/7 lanes; each ticker's hub is /tickers/<SYM>.
    { source: "/stocks", destination: "/markets", permanent: true },
    { source: "/stocks/:symbol", destination: "/tickers/:symbol", permanent: true },
    // No /docs redirect (R4-10, D-227): the guides (DOCS_URL, an external site by default since 67cb549) are linked, and
    // /docs stays the app's own Reference — /stats, /proof and Trader Edge link its /docs/record.
  ],
};

export default config;
