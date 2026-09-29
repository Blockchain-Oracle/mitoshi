"use client";

/**
 * The chain port for React (Masayume 68f7a09:packages/markets/src/react/provider.tsx, rebuilt without the Somnia SDK):
 * configures the one read runtime for this tab and publishes the `MarketsProvider` port. Mounted once in the app
 * route group; the site group (landing, docs, proof, status) never loads it (D-050).
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { MarketsProvider as MarketsPort } from "@cwf/core";
import type { MarketsEnv } from "../env";
import { createMarketsProvider } from "../provider";
import { configureMarkets } from "../runtime/read-runtime";

const PortContext = createContext<MarketsPort | null>(null);
const EnvContext = createContext<MarketsEnv | null>(null);

export function MarketsProvider({ env, children }: { env: MarketsEnv; children: ReactNode }) {
  const [port] = useState(() => {
    configureMarkets(env);
    return createMarketsProvider();
  });
  return (
    <EnvContext.Provider value={env}>
      <PortContext.Provider value={port}>{children}</PortContext.Provider>
    </EnvContext.Provider>
  );
}

export function useMarkets(): MarketsPort {
  const port = useContext(PortContext);
  if (!port) throw new Error("useMarkets() outside <MarketsProvider>");
  return port;
}

export function useMarketsEnv(): MarketsEnv {
  const env = useContext(EnvContext);
  if (!env) throw new Error("useMarketsEnv() outside <MarketsProvider>");
  return env;
}
