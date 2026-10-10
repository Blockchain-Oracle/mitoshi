"use client";
/**
 * The roller's reason on the Window chip (S6, G-08): a lane with no Window says why when ops paused it — a corporate
 * action (`paused: corporate action (<why>)`, the skip file), a halt (`paused: halted (<reason>)`), or no signed source
 * (`paused: no signed source …`, PLTR/AMD 24/7 on testnet) — instead of a bare "no Window".
 */
import { haltLabel, HALT_REASONS, isTickerSymbol, type HaltReason, type LaneBasis } from "@cwf/core";
import { laneState, useMarketSession } from "@/features/markets/session";

export const PAUSED_WORDS = {
  corporate: (why: string) => `paused: corporate action — ${why}`,
  halted: (label: string) => `paused: ${label.toLowerCase()}`,
  noSource: "paused: no signed price source",
} as const;

/** The chip's words for a roller state, or null when the lane isn't paused. */
export function pausedWords(state: string | null): string | null {
  if (!state?.startsWith("paused")) return null;
  const corporate = /^paused: corporate action \((.*)\)$/.exec(state);
  if (corporate) return PAUSED_WORDS.corporate(corporate[1]!);
  const halted = /^paused: halted \((.*)\)$/.exec(state);
  if (halted && (HALT_REASONS as readonly string[]).includes(halted[1]!)) return PAUSED_WORDS.halted(haltLabel(halted[1] as HaltReason));
  return PAUSED_WORDS.noSource;
}

/** The selected lane's paused reason, from the session stream's roller states. */
export function useLaneNote(symbol: string, lane: { basis: LaneBasis; intervalSec: number } | null): string | null {
  const session = useMarketSession();
  if (!lane || !isTickerSymbol(symbol)) return null;
  return pausedWords(laneState(session, symbol, lane.basis, lane.intervalSec));
}
