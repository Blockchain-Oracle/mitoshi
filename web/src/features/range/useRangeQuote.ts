"use client";
/**
 * The chain prices the band (Ported from Masayume 68f7a09:web/src/features/range/useRangeQuote.ts): `previewOpen` via
 * `quoteRangeOnchain`, debounced 400 ms and requoted on the ticket's interval, the seconds left read at quote time.
 * New on Tempo: the basis the bars are drawn from (`previewBasis`), the PD-2/D-119 drift of the book's centre from the
 * live spot (`previewDriftE4`, the rule the open enforces with a signed spot — a stale book is named before the hold)
 * and the reserve's caps for the round (`checkCapacity`).
 * R4-5 (D-227): no churn. The drift is keyed by Window and re-read every 10 s with the latest spot (was one RPC per
 * tick); basis, drift and capacity keep their last value through a refetch; `shown` keeps the last quote on screen while
 * a changed band is being requoted, so the figures never blank.
 */
import { REQUOTE_MS } from "@cwf/core/constants";
import type { Diagnosis } from "@cwf/core";
import type { RangeMode, RangeParams, RangeQuote } from "@cwf/core/range";
import { previewRangeBasis, previewRangeDrift, quoteRangeOnchain, readRangeCapacity, type RangeBand, type RangeWindowBasis } from "@cwf/markets/range";
import { useReadingQuery } from "@cwf/markets/react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { useDebounced } from "../markets/ticket/useDebounced";
import { rangeKeys } from "./data";

const DEBOUNCE_MS = 400;
const DRIFT_MS = 10_000;

export interface RangeQuoteState {
  /** The quote for the band and amount on screen now — the only one a hold may place. */
  quote: RangeQuote | null;
  /** `quote`, or the last one while a changed band is requoted (display only). */
  shown: RangeQuote | null;
  loading: boolean;
  error: Diagnosis | null;
  basis: RangeWindowBasis | null;
  /** |σ × 1e4| between the book's centre and the live spot; the open refuses past `params.maxDriftE4`. */
  driftE4: bigint | null;
  capacity: Diagnosis | null;
  retry: () => void;
}

/**
 * |σ × 1e4| between the Window's book centre and the live spot (`previewDriftE4`), keyed by Window and re-read every
 * 10 s with the latest spot, kept through a refetch. Shared by Range and Moonshot (R4-5 review: Moonshot opens through
 * the same lane and the same 2σ bound, and met it only after the passkey).
 */
export function useRangeDrift(marketId: string | null, asset: string | null, spotE8: bigint | null, enabled: boolean): bigint | null {
  const spotRef = useRef(spotE8);
  useEffect(() => {
    spotRef.current = spotE8;
  }, [spotE8]);
  const driftQ = useQuery({
    queryKey: [...rangeKeys.all, "drift", marketId ?? "", asset ?? ""],
    queryFn: async () => {
      const d = await previewRangeDrift(marketId as Hex, asset!, (spotRef.current ?? spotE8)!);
      return d < 0n ? -d : d;
    },
    enabled: enabled && marketId !== null && asset !== null && spotE8 !== null,
    refetchInterval: DRIFT_MS,
    staleTime: DRIFT_MS,
    placeholderData: keepPreviousData,
  });
  return driftQ.data ?? null;
}

export function useRangeQuote({ band, expirySec, mode, params, spotE8, enabled }: { band: RangeBand | null; expirySec: number | null; mode: RangeMode; params: RangeParams | null; spotE8: bigint | null; enabled: boolean }): RangeQuoteState {
  const queryClient = useQueryClient();
  const amount = mode.kind === "fixStake" ? mode.stakeBase : mode.maxPayoutBase;
  const signature = band ? `${band.marketId}:${band.asset}:${band.side}:${band.lowPrint}:${band.highPrint}|${mode.kind}:${amount}` : "";
  const debounced = useDebounced(signature, DEBOUNCE_MS);
  const askable = enabled && params !== null && band !== null && expirySec !== null && amount > 0n;
  const active = askable && debounced === signature;
  const reading = useReadingQuery(rangeKeys.quote(debounced), () => quoteRangeOnchain(band!, mode, params!, Math.max(1, expirySec! - Math.floor(Date.now() / 1000))), { enabled: active, pollMs: REQUOTE_MS });
  const quote = active && reading?.ok ? reading.value : null;
  const [last, setLast] = useState<RangeQuote | null>(null);
  if (quote && quote !== last) setLast(quote);
  const driftE4 = useRangeDrift(band?.marketId ?? null, band?.asset ?? null, spotE8, enabled && band !== null);
  const basisQ = useQuery({
    queryKey: [...rangeKeys.all, "basis", band?.marketId ?? "", band?.asset ?? ""],
    queryFn: async () => {
      const r = await previewRangeBasis(band!.marketId, band!.asset);
      return r.ok ? r.value : null;
    },
    enabled: enabled && band !== null,
    refetchInterval: REQUOTE_MS,
    placeholderData: keepPreviousData,
  });
  const capQ = useQuery({
    queryKey: [...rangeKeys.all, "capacity", quote ? `${quote.maxPayoutBase - quote.stakeBase}` : "", expirySec ?? 0],
    queryFn: async () => {
      const r = await readRangeCapacity(quote!.maxPayoutBase - quote!.stakeBase, expirySec!);
      return r.ok ? r.value.refusal : null;
    },
    enabled: quote !== null && expirySec !== null,
    staleTime: REQUOTE_MS,
    placeholderData: keepPreviousData,
  });
  const retry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: rangeKeys.quote(debounced) });
  }, [queryClient, debounced]);
  const error = active && reading && !reading.ok ? reading.error : null;
  return {
    quote,
    shown: error ? null : (quote ?? last),
    loading: askable && (!active || reading === null),
    error,
    basis: basisQ.data ?? null,
    driftE4,
    capacity: capQ.data ?? null,
    retry,
  };
}
