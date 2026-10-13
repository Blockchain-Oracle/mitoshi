"use client";
// Ported from Owarine 90a91d71:web/src/features/status/useStatus.ts (R4-10, D-227): `/api/status` re-read every 30 s
// while the tab is visible, starting from the server's own read (no flash of an empty board). A failed poll keeps the
// last report rather than inventing one.
import { useEffect, useState } from "react";
import type { StatusReport } from "./probes";

export const STATUS_POLL_MS = 30_000;

export function useStatus(initial: StatusReport): StatusReport {
  const [report, setReport] = useState(initial);
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/status", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ report: StatusReport | null }>) : null))
        .then((b) => alive && b?.report && setReport(b.report))
        .catch(() => undefined);
    };
    const id = setInterval(read, STATUS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return report;
}
