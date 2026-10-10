"use client";
// The crowd beside the session cell (S6, L-04: the marquee's crowd sentiment re-homed to the Window chip, RV-11):
// "Crowd 62% UP · 24 h" from `/api/sentiment`, read when the ticker changes and every five minutes. No reading (too few
// calls even over the week, or the index unreadable) shows nothing rather than a number nobody made.
import { useEffect, useState } from "react";
import type { CrowdReading } from "@/features/crowd/reading";
import { CROWD } from "@/features/crowd/copy";

const EVERY_MS = 5 * 60_000;

export function CrowdCellView({ reading }: { reading: CrowdReading }) {
  if (reading.upBps === null || reading.window === null) return null;
  const up = reading.upBps >= 5_000;
  const pct = Math.round((up ? reading.upBps : 10_000 - reading.upBps) / 100);
  const side = up ? "UP" : "DOWN";
  return (
    <span className="tm-glass tm-session tm-crowd" data-lean={up ? "up" : "down"} role="status" aria-label={CROWD.aria(pct, side, reading.window, reading.symbol)}>
      <span aria-hidden>{CROWD.label}</span>
      <span className="tm-crowd-figure" aria-hidden>{pct}% {side}</span>
      <span aria-hidden>· {reading.window}</span>
    </span>
  );
}

export function CrowdCell({ symbol }: { symbol: string }) {
  const [reading, setReading] = useState<CrowdReading | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      void fetch(`/api/sentiment?symbol=${encodeURIComponent(symbol)}`)
        .then((r) => (r.ok ? (r.json() as Promise<CrowdReading>) : null))
        .then((r) => live && setReading(r?.symbol === symbol ? r : null))
        .catch(() => live && setReading(null));
    setReading(null);
    read();
    const t = setInterval(read, EVERY_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [symbol]);
  return reading ? <CrowdCellView reading={reading} /> : null;
}
