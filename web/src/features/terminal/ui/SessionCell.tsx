"use client";
// Ported from Agari 03b30ab:web/src/features/markets/session/MarketSessionChip.tsx — re-homed from the marquee onto the
// terminal's Window chip (RV-11, RV-57; S6): Mitoshi's glass and tokens, the stream-fed session (no poll), a minute beat.
import { haltLabel, isStockSymbol, isTickerSymbol, type LaneBasis } from "@cwf/core";
import { sessionStateWord } from "@cwf/core/copy";
import { laneHaltAsset, useMarketSession, type MarketSession } from "@/features/markets/session";
import { SESSION } from "@/features/markets/session/copy";
import { useClockValue } from "@/lib/clock";
import { useSessionPhrase, useWhen } from "@/lib/when";

/**
 * The NYSE hour beside the Window chip: "● Open · closes 21:00 (16:00 ET), in 2h 05m", "● Pre-market · opens 14:30
 * (09:30 ET), in 1h 12m", "● Weekend · reopens Mon 14:30 (09:30 ET)". The asset's halt replaces it while it holds —
 * "● Signed price stale · since 15:02 (10:02 ET)" — on any lane at any hour (a 24/7 lane halts at the weekend too).
 * Stocks only: crypto never closes. On a 24/7 lane the NYSE hours don't describe the Window — its feed trades through
 * nights and weekends — so the cell says "24/7 market" (Owarine 90a91d71 `MarketSessionChip`; O-2, D-222).
 * `nowSec` is the minute the phrase counts from (fixtures pass a canned one).
 */
export function SessionCellView({ session, symbol, basis, nowSec }: { session: MarketSession; symbol: string; basis: LaneBasis | null; nowSec: number }) {
  const phrase = useSessionPhrase();
  const when = useWhen();
  if (session.halt) {
    const label = haltLabel(session.halt.reason);
    const since = when(session.halt.sinceSec, { nowSec });
    return (
      <span className="tm-glass tm-session" data-state="halted" role="status" aria-label={SESSION.haltAria(label, symbol, since)}>
        <span className="tm-session-dot" aria-hidden />
        <span className="tm-session-word" aria-hidden>{label}</span>
        <span aria-hidden>· {SESSION.since(since)}</span>
      </span>
    );
  }
  if (!isStockSymbol(symbol)) return null;
  if (basis === "stock24") {
    return (
      <span className="tm-glass tm-session" data-state="regular" role="status" aria-label={SESSION.roundTheClockAria(symbol)}>
        <span className="tm-session-dot" aria-hidden />
        <span className="tm-session-word" aria-hidden>{SESSION.roundTheClock}</span>
      </span>
    );
  }
  const word = sessionStateWord(session.status);
  const line = phrase(session.status, nowSec);
  // The phrase is "<word> · <tail>"; without a tail (no known open) the word stands alone.
  const tail = line.startsWith(`${word} · `) ? line.slice(word.length + 3) : null;
  return (
    <span className="tm-glass tm-session" data-state={session.status.state} role="status" aria-label={SESSION.aria(word, tail)}>
      <span className="tm-session-dot" aria-hidden />
      <span className="tm-session-word" aria-hidden>{word}</span>
      {tail ? <span aria-hidden>· {tail}</span> : null}
    </span>
  );
}

/** The live cell: the stream-fed session for the lane on screen, re-rendered on the minute. Nothing while unknown. */
export function SessionCell({ symbol, basis }: { symbol: string; basis: LaneBasis | null }) {
  const asset = isTickerSymbol(symbol) ? laneHaltAsset(symbol, basis ?? (isStockSymbol(symbol) ? "regular" : "crypto24")) : undefined;
  const session = useMarketSession(asset);
  const minute = useClockValue((ms) => Math.floor(ms / 60_000));
  if (!session || !asset || minute === 0) return null;
  return <SessionCellView session={session} symbol={symbol} basis={basis} nowSec={minute * 60} />;
}

/**
 * The session in a word for the phone's Window chip (R4-3, D-227; terminal spec gap 5): the halt's label while one
 * holds, else the NYSE state on a Regular stock lane ("Pre-market · trades 1h 12m"); nothing for crypto or a 24/7 lane.
 * The same stream-fed session as the cell, which shows from 1024 px.
 */
export function useSessionWord(symbol: string, basis: LaneBasis | null): string | null {
  const asset = isTickerSymbol(symbol) ? laneHaltAsset(symbol, basis ?? (isStockSymbol(symbol) ? "regular" : "crypto24")) : undefined;
  const session = useMarketSession(asset);
  if (!session || !asset) return null;
  if (session.halt) return haltLabel(session.halt.reason);
  if (!isStockSymbol(symbol) || basis === "stock24") return null;
  return sessionStateWord(session.status);
}
