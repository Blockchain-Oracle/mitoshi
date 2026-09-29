import type { NextConfig } from "next";

/** Plan D-050 (D41): cached rendering, the React Compiler, and no agent files written by `next dev`. */
const config: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  agentRules: false,
  partialPrefetching: true,
  transpilePackages: ["@cwf/core", "@cwf/markets"],
};

export default config;
