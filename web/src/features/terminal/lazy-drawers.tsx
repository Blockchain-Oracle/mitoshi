"use client";

/**
 * The terminal's drawers, off the screen's first load (F-S23-08): each is its own chunk, mounted once the main thread is
 * idle after the first paint — or at once when the address asks for one open (`?d=`) — so opening one stays instant
 * and none of their modules is evaluated inside the screen's first long task. Closed, a drawer renders nothing.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export const MarketsDrawer = dynamic(() => import("./ui/MarketsDrawer").then((m) => m.MarketsDrawer), { ssr: false });
export const SettingsDrawer = dynamic(() => import("./ui/SettingsDrawer").then((m) => m.SettingsDrawer), { ssr: false });
export const AccountDrawer = dynamic(() => import("./ui/AccountDrawer").then((m) => m.AccountDrawer), { ssr: false });
export const PositionDetails = dynamic(() => import("./ui/PositionDetails").then((m) => m.PositionDetails), { ssr: false });
export const ExitsDrawer = dynamic(() => import("./ui/ExitsDrawer").then((m) => m.ExitsDrawer), { ssr: false });
export const RoomDrawer = dynamic(() => import("./ui/RoomDrawer").then((m) => m.RoomDrawer), { ssr: false });
export const AlertsDrawer = dynamic(() => import("./ui/AlertsDrawer").then((m) => m.AlertsDrawer), { ssr: false });

/** Safari has no `requestIdleCallback`: a short timeout after the first paint stands in. */
const IDLE_TIMEOUT_MS = 2_000;

/** True from the first idle moment after mount, or from the first render that `wanted` a drawer; never false again. */
export function useDrawersMounted(wanted: boolean): boolean {
  const [mounted, setMounted] = useState(wanted);
  if (wanted && !mounted) setMounted(true);
  useEffect(() => {
    if (mounted) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setMounted(true), { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setMounted(true), IDLE_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [mounted]);
  return mounted;
}
