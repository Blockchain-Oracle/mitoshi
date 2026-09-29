"use client";

/**
 * The chain port for React (Masayume 68f7a09:packages/markets/src/react/provider.tsx, rebuilt without the Somnia SDK):
 * configures the one read runtime for this tab and publishes the `MarketsProvider` port. The site group (landing,
 * docs, proof, status) never loads it (D-050); the web app builds it in its late data layer (contexts.tsx).
 */
import { useState, type ReactNode } from "react";
import type { MarketsEnv } from "../env";
import { createMarketsProvider } from "../provider";
import { configureMarkets } from "../runtime/read-runtime";
import { MarketsContexts } from "./contexts";

export { useMarkets, useMarketsEnv, useMarketsPort } from "./contexts";

export function MarketsProvider({ env, children }: { env: MarketsEnv; children: ReactNode }) {
  const [port] = useState(() => {
    configureMarkets(env);
    return createMarketsProvider();
  });
  return (
    <MarketsContexts port={port} env={env}>
      {children}
    </MarketsContexts>
  );
}
