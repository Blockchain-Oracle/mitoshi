"use client";
import type { Address } from "@cwf/core";
import { useCallback, useSyncExternalStore } from "react";
import { callsOf, subscribeCalls, type PlacedCall } from "./calls-store";

const NONE: PlacedCall[] = [];

/** The calls this account placed from this device, newest first; empty on the server. */
export function useCalls(wallet: Address | null): PlacedCall[] {
  const read = useCallback(() => callsOf(wallet), [wallet]);
  return useSyncExternalStore(subscribeCalls, read, () => NONE);
}
