"use client";
// Masayume's `useFirstRun` (68f7a09:web/src/features/onboarding/useFirstRun.ts) per explainer; blocked storage shows
// it again next visit.
import { useCallback } from "react";
import { usePersistedState } from "@/lib/persisted";
import type { ExplainerId } from "./copy";

const codec = { parse: (raw: string) => (raw === "1" ? true : null), serialize: (v: boolean) => (v ? "1" : "0") };

export function useFirstUse(id: ExplainerId): { show: boolean; dismiss: () => void } {
  const [seen, setSeen] = usePersistedState(`cwf.explained.${id}`, false, codec);
  const dismiss = useCallback(() => setSeen(true), [setSeen]);
  // Shown from the first render (server included) so a first visit never shifts when it appears (CLS, §3.1); only a
  // visitor who already dismissed it sees it leave after hydration.
  return { show: !seen, dismiss };
}
