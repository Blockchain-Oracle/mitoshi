"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/ticket/useQuote.ts — debounce the stake ~350 ms, then ride the
// chain book (a fresh walk, re-walked on every book event and every 12 s): visibly stale when old, never reused silently.
import type { EventMarket, Quote, Reading, Side } from "@cwf/core";
import { QUOTE_DEBOUNCE_MS, QUOTE_STALE_AFTER_MS } from "@cwf/core/constants";
import { useStakeQuote } from "@cwf/markets/react";
import { useDebounced } from "./useDebounced";

export interface QuoteState {
  reading: Reading<Quote | null> | null;
  quote: Quote | null;
  stale: boolean;
  pending: boolean;
}

export function useQuote({ market, side, stakeBase, nowMs, enabled }: { market: EventMarket; side: Side | null; stakeBase: bigint; nowMs: number; enabled: boolean }): QuoteState {
  const debounced = useDebounced(stakeBase, QUOTE_DEBOUNCE_MS);
  const active = enabled && side !== null && debounced > 0n;
  const reading = useStakeQuote({ market, side: side ?? "up", stakeBase: debounced, enabled: active });
  const quote = active && reading?.ok ? reading.value : null;
  const aged = quote !== null && nowMs > 0 && nowMs - quote.quotedAtMs > QUOTE_STALE_AFTER_MS;
  return {
    reading: active ? reading : null,
    quote,
    stale: Boolean(reading?.ok && (reading.stale || aged)),
    pending: enabled && side !== null && (stakeBase !== debounced || (active && reading === null)),
  };
}
