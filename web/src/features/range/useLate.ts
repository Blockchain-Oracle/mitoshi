"use client";
// A wait that turns honest (R6 games §4.3.4, T17): `late` once `waiting` has held for `afterMs` on the page's clock;
// the clock restarts when `key` changes (a new band, a new amount) or on `restart` (Retry). Started after mount, so a
// prerender never reads the time.
import { useEffect, useState } from "react";

export function useLate(waiting: boolean, afterMs: number, nowMs: number, key = ""): { late: boolean; restart: () => void } {
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => setSince(waiting ? Date.now() : null), [waiting, key]);
  return { late: waiting && since !== null && nowMs > 0 && nowMs - since > afterMs, restart: () => setSince(Date.now()) };
}
