"use client";
/**
 * The app's late data layer (§3.1, D-071): the query client, the markets port and the boot reading arrive right after
 * first paint (`DataRuntime`, a lazy island) instead of in the first load. Until then `useDataReady()` is false and
 * any component that reads through TanStack Query renders its placeholder — the pending pages never read at all.
 */
import type { ClockSync, Reading } from "@cwf/core";
import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";

export interface DataLayerValue {
  client: QueryClient | null;
  boot: Reading<ClockSync> | null;
}

export const DataLayerContext = createContext<DataLayerValue>({ client: null, boot: null });

export function useDataReady(): boolean {
  return useContext(DataLayerContext).client !== null;
}

export function useDataLayer(): DataLayerValue {
  return useContext(DataLayerContext);
}
