"use client";
/**
 * The root layout's page-level effects, in ONE client module so they ship as one chunk (§3.1, D-071: lab LCP on slow
 * 4G charges a round trip per pre-paint request): the web fonts' second stage (on idle), the field-vitals reporter
 * (loaded on idle), and the delegated dismiss for server-rendered first-use explainers.
 */
import { useEffect } from "react";
import { onIdle } from "@/lib/idle";
import { EXPLAINED_PREFIX } from "@/lib/theme";

function dismissExplainer(event: MouseEvent): void {
  const id = (event.target as Element | null)?.closest?.("[data-explainer-dismiss]")?.getAttribute("data-explainer-dismiss");
  if (!id) return;
  document.documentElement.classList.add(`cwf-explained-${id}`);
  try {
    localStorage.setItem(`${EXPLAINED_PREFIX}${id}`, "1");
  } catch {
    // storage refused: hidden for this page, shown again next visit
  }
}

export function PageRuntime() {
  useEffect(() => {
    document.addEventListener("click", dismissExplainer);
    const cancelIdle = onIdle(() => {
      document.documentElement.classList.add("wf-late");
      void import("@/features/vitals/report").then((m) => m.startVitals());
    });
    return () => {
      document.removeEventListener("click", dismissExplainer);
      cancelIdle();
    };
  }, []);
  return null;
}
