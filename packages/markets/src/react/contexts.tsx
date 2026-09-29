"use client";
/**
 * The chain port's React contexts, light (no runtime, no viem): the port (`MarketsProvider` from @cwf/core) and the env.
 * `MarketsProvider` (provider.tsx) builds and provides them in one step; a host that builds the port later — the web's
 * data layer, which loads after first paint (§3.1, D-071) — provides them itself with `MarketsContexts`, and the port is
 * null until then (`useMarketsPort`).
 */
import { createContext, useContext, type ReactNode } from "react";
import type { MarketsProvider as MarketsPort } from "@cwf/core";
import type { MarketsEnv } from "../env";

const PortContext = createContext<MarketsPort | null>(null);
const EnvContext = createContext<MarketsEnv | null>(null);

export function MarketsContexts({ port, env, children }: { port: MarketsPort | null; env: MarketsEnv; children: ReactNode }) {
  return (
    <EnvContext.Provider value={env}>
      <PortContext.Provider value={port}>{children}</PortContext.Provider>
    </EnvContext.Provider>
  );
}

export function useMarkets(): MarketsPort {
  const port = useContext(PortContext);
  if (!port) throw new Error("useMarkets() before the markets port exists (outside <MarketsProvider>, or before the data layer loaded)");
  return port;
}

/** The port, or null while a late data layer is still loading. */
export function useMarketsPort(): MarketsPort | null {
  return useContext(PortContext);
}

export function useMarketsEnv(): MarketsEnv {
  const env = useContext(EnvContext);
  if (!env) throw new Error("useMarketsEnv() outside <MarketsContexts>");
  return env;
}
