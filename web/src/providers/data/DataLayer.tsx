"use client";
/**
 * The eager half of the data layer: TanStack Query's own context and the markets contexts, provided from the first
 * render with null values, filled in when `DataRuntime` loads right after hydration — so nothing under it remounts and
 * query-core, the markets runtime and viem stay out of the first load (§3.1, D-071).
 */
import type { ClockSync, MarketsProvider as MarketsPort, Reading } from "@cwf/core";
import { MarketsContexts } from "@cwf/markets/react";
import { QueryClientContext, type QueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { webEnv } from "@/lib/env";
import { DataLayerContext } from "./context";
import type { DataRuntimeProps } from "./DataRuntime";

const DataRuntime = dynamic<DataRuntimeProps>(() => import("./DataRuntime"), { ssr: false });

export function DataLayer({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<{ client: QueryClient; port: MarketsPort } | null>(null);
  const [boot, setBoot] = useState<Reading<ClockSync> | null>(null);
  const onReady = useCallback((l: { client: QueryClient; port: MarketsPort }) => setLayer(l), []);
  const value = useMemo(() => ({ client: layer?.client ?? null, boot }), [layer, boot]);
  return (
    <QueryClientContext.Provider value={layer?.client}>
      <MarketsContexts port={layer?.port ?? null} env={webEnv.markets}>
        <DataLayerContext.Provider value={value}>
          {children}
          <DataRuntime onReady={onReady} onBoot={setBoot} />
        </DataLayerContext.Provider>
      </MarketsContexts>
    </QueryClientContext.Provider>
  );
}
