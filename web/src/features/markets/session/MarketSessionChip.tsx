"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/session/MarketSessionChip.tsx (O-2/O-5, D-222) — on Mitoshi's
// session store and lanes: a 24/7 lane or crypto says "24/7 market"; a halt says only why; otherwise the NYSE hours.
import { haltLabel, isStockSymbol, isTickerSymbol, type LaneBasis } from "@cwf/core";
import { sessionStateWord } from "@cwf/core/copy";
import { useClockValue } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { useSessionPhrase } from "@/lib/when";
import { SESSION } from "./copy";
import { laneHaltAsset, type MarketSession } from "./model";
import { useMarketSession } from "./useMarketSession";
import "./market-session.css";

interface ChipProps {
  /** The Window's asset and lane: a halt replaces the hours while it holds; a 24/7 lane never shows NYSE hours. */
  asset?: string;
  basis?: LaneBasis | null;
  className?: string;
}

export function MarketSessionChipView({ session, asset, basis, className, nowSec }: ChipProps & { session: MarketSession; nowSec: number }) {
  const phrase = useSessionPhrase();
  if (session.halt && asset) {
    const label = haltLabel(session.halt.reason);
    return (
      <span className={cn("mks-chip", className)} data-state="halted" role="status" aria-label={`${asset}: ${label}`}>
        <span className="mks-chip-dot" aria-hidden />
        <span className="mks-chip-state mks-chip-halt" aria-hidden>{label}</span>
      </span>
    );
  }
  if (asset && (!isStockSymbol(asset) || basis === "stock24")) {
    return (
      <span className={cn("mks-chip", className)} data-state="regular" role="status" aria-label={SESSION.roundTheClockAria(asset)}>
        <span className="mks-chip-dot" aria-hidden />
        <span className="mks-chip-state">{SESSION.roundTheClock}</span>
      </span>
    );
  }
  const word = sessionStateWord(session.status);
  const line = phrase(session.status, nowSec);
  const tail = line.startsWith(`${word} · `) ? line.slice(word.length + 3) : session.label;
  return (
    <span className={cn("mks-chip", className)} data-state={session.status.state} role="status" aria-label={SESSION.aria(word, tail)}>
      <span className="mks-chip-dot" aria-hidden />
      <span className="mks-chip-state" aria-hidden>{word}</span>
      <span className="mks-chip-sep" aria-hidden>·</span>
      <span aria-hidden>{tail}</span>
    </span>
  );
}

/** Nothing while the session is unknown, so a dead ops process never prints hours it can't vouch for. */
export function MarketSessionChip({ asset, basis = null, className }: ChipProps) {
  const halt = asset && isTickerSymbol(asset) ? laneHaltAsset(asset, basis ?? (isStockSymbol(asset) ? "regular" : "crypto24")) : undefined;
  const session = useMarketSession(halt);
  const minute = useClockValue((ms) => Math.floor(ms / 60_000));
  if (!session || minute === 0) return null;
  return <MarketSessionChipView session={session} asset={asset} basis={basis} className={className} nowSec={minute * 60} />;
}
