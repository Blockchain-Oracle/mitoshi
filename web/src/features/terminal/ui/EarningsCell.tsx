"use client";
// The earnings line beside the session cell (S6): ops' Finnhub calendar from the session stream, worded by
// `earningsNote` — a warning on the Window that sits on a report, else the next report ahead. A warning, never a blocker.
import type { EventMarket } from "@cwf/core";
import { useMarketSession } from "@/features/markets/session";
import { earningsNote } from "@/features/markets/session/earnings";
import { useClockValue } from "@/lib/clock";

export function EarningsCell({ symbol, market }: { symbol: string; market: Pick<EventMarket, "lane" | "tradingStartSec" | "expirySec"> | null }) {
  const session = useMarketSession();
  const minute = useClockValue((ms) => Math.floor(ms / 60_000));
  const note = session && minute ? earningsNote(symbol, market, session.earnings, minute * 60) : null;
  if (!note) return null;
  return (
    <span className="tm-glass tm-session tm-earnings" data-tone={note.tone} role="status">
      {note.text}
    </span>
  );
}
