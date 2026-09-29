"use client";
// Masayume's `useFirstRun` (68f7a09:web/src/features/onboarding/useFirstRun.ts) per explainer: hydrates after mount so
// a returning visitor never sees a frame of a hint they dismissed; blocked storage shows it again next visit.
import { useCallback } from "react";
import { usePersistedState } from "@/lib/persisted";
import type { ExplainerId } from "./copy";

const codec = { parse: (raw: string) => (raw === "1" ? true : null), serialize: (v: boolean) => (v ? "1" : "0") };

export function useFirstUse(id: ExplainerId): { show: boolean; dismiss: () => void } {
  const [seen, setSeen, hydrated] = usePersistedState(`cwf.explained.${id}`, false, codec);
  const dismiss = useCallback(() => setSeen(true), [setSeen]);
  return { show: hydrated && !seen, dismiss };
}
