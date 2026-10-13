"use client";
// A page whose screen reads through TanStack Query waits for the late data layer (§3.1, D-071): `fallback` until the
// query client is up (and in the prerender), then the screen. R4-11's launch and themes pages (D-227).
import type { ReactNode } from "react";
import { useDataReady } from "./context";

export function DataGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return useDataReady() ? children : fallback;
}
