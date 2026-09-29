"use client";
// Ported from Masayume 68f7a09:web/src/features/install/useInstallPrompt.ts — now reading the app-wide store.

import { useCallback, useState, useSyncExternalStore } from "react";
import { installServerSnapshot, installSnapshot, promptInstall, subscribeInstall, type InstallSnapshot } from "./install-store";

export type InstallState = "installed" | "prompt" | "ios" | "manual";
export type InstallChoice = "accepted" | "dismissed";

export interface InstallPrompt {
  state: InstallState;
  install: () => Promise<InstallChoice | null>;
  busy: boolean;
}

export function useInstallState(): InstallSnapshot {
  return useSyncExternalStore(subscribeInstall, installSnapshot, installServerSnapshot);
}

/** The install state machine behind the `/download` CTA. Server and first paint are `manual`, so hydration matches. */
export function useInstallPrompt(): InstallPrompt {
  const s = useInstallState();
  const [busy, setBusy] = useState(false);
  const install = useCallback(async () => {
    setBusy(true);
    try {
      return await promptInstall();
    } finally {
      setBusy(false);
    }
  }, []);
  const state: InstallState = s.installed ? "installed" : s.canPrompt ? "prompt" : s.ios ? "ios" : "manual";
  return { state, install, busy };
}
