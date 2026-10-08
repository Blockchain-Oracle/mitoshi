"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/useAppUpdate.ts — on `lib/toast` (D-202: a persistent
// neutral toast with one action).
import { useEffect } from "react";
import { notify } from "@/lib/toast";
import { TERMINAL } from "./copy";

const CHECK_MS = 5 * 60_000;
const RUNNING = process.env.NEXT_PUBLIC_BUILD_ID ?? null;

/**
 * Tradash's PWA updater: a persistent "New version available" toast with Refresh. Mitoshi has no service worker, so
 * the screen asks the server which build it runs — every five minutes and whenever the tab comes back — and offers
 * Refresh once that differs from the build this page was loaded from.
 */
export function useAppUpdate(): void {
  useEffect(() => {
    if (!RUNNING) return;
    let shown = false;
    const check = async () => {
      if (shown || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await res.json()) as { build: string | null };
        if (!build || build === RUNNING) return;
        shown = true;
        notify.item({ id: "app-update", title: TERMINAL.update.title, description: TERMINAL.update.body, timeout: 0, action: { label: TERMINAL.update.refresh, onClick: () => window.location.reload() } });
      } catch {
        // Offline or mid-deploy: the next check asks again.
      }
    };
    const timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
}
