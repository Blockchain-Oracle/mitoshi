"use client";
// How old what the page shows is (R6 money, T10; D-230), in place of the old live eyebrow nothing backed: a
// stamp that ticks from the last successful read ("Updated 12 s ago"), Senryo's StaleStamp grammar. One shared tick
// (`useClockValue`), so a page of stamps costs no timers; nothing at all before the first read.
import { useClockValue } from "@/lib/clock";
import { NOTICES } from "./copy";

export function Freshness({ atMs }: { atMs: number | null }) {
  const ageSec = useClockValue((now) => (atMs === null || now === 0 ? null : Math.max(0, Math.floor((now - atMs) / 1000))));
  return (
    <div className="news-live act-fresh">
      <span className="news-live-dot" aria-hidden data-stale={ageSec !== null && ageSec > 120 ? "" : undefined} />
      {ageSec === null ? null : <span className="news-live-label">{NOTICES.updated(ageSec)}</span>}
    </div>
  );
}
