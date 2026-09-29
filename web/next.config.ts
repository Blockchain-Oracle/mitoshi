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
  transpilePackages: ["@cwf/core", "@cwf/markets", "@cwf/tokens", "@cwf/db"],
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
