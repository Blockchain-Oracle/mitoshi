"use client";
/**
 * The data layer's heavy half, loaded after first paint: builds the one QueryClient (shared with wagmi) and the markets
 * port, restores the persisted read cache, runs the chain-clock boot, and publishes all of it to `DataLayer`. It
 * renders nothing of the page: the page stays mounted under `DataLayer`'s contexts, which simply fill in.
 */
import type { ClockSync, MarketsProvider as MarketsPort, Reading } from "@cwf/core";
import { configureMarkets, createMarketsProvider } from "@cwf/markets";
import { MarketsContexts, useChainClock } from "@cwf/markets/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { setClockOffset } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { usePersistedReadCache } from "../persist";
import { getQueryClient } from "../query-client";

const CHAIN_ID = webEnv.markets.network === "mainnet" ? 4217 : 42431;

export interface DataRuntimeProps {
  onReady: (layer: { client: QueryClient; port: MarketsPort }) => void;
  onBoot: (boot: Reading<ClockSync> | null) => void;
}

export default function DataRuntime({ onReady, onBoot }: DataRuntimeProps) {
  const [layer] = useState(() => {
    configureMarkets(webEnv.markets);
    return { client: getQueryClient(), port: createMarketsProvider() };
  });
  usePersistedReadCache(layer.client, CHAIN_ID);
  useEffect(() => onReady(layer), [layer, onReady]);
  return (
    <QueryClientProvider client={layer.client}>
      <MarketsContexts port={layer.port} env={webEnv.markets}>
        <Boot onBoot={onBoot} />
      </MarketsContexts>
    </QueryClientProvider>
  );
}

function Boot({ onBoot }: { onBoot: DataRuntimeProps["onBoot"] }) {
  const boot = useChainClock();
  useEffect(() => {
    if (boot?.ok) setClockOffset(boot.value.offsetMs);
    onBoot(boot);
  }, [boot, onBoot]);
  return null;
}
