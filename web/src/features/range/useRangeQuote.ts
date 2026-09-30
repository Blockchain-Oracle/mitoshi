"use client";
/**
 * The chain prices the band (Ported from Masayume 68f7a09:web/src/features/range/useRangeQuote.ts): `previewOpen` via
 * `quoteRangeOnchain`, debounced 400 ms and requoted on the ticket's interval, the seconds left read at quote time.
 * New on Tempo: the basis the bars are drawn from (`previewBasis`), the PD-2/D-119 drift of the book's centre from the
 * live spot (`previewDriftE4`, the rule the open enforces with a signed spot — a stale book is named before the hold)
 * and the reserve's caps for the round (`checkCapacity`).
 */
import { REQUOTE_MS } from "@cwf/core/constants";
import type { Diagnosis } from "@cwf/core";
import type { RangeMode, RangeParams, RangeQuote } from "@cwf/core/range";
import { previewRangeBasis, previewRangeDrift, quoteRangeOnchain, readRangeCapacity, type RangeBand, type RangeWindowBasis } from "@cwf/markets/range";
import { useReadingQuery } from "@cwf/markets/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Hex } from "viem";
import { useDebounced } from "../markets/ticket/useDebounced";
import { rangeKeys } from "./data";

const DEBOUNCE_MS = 400;

export interface RangeQuoteState {
  quote: RangeQuote | null;
  loading: boolean;
  error: Diagnosis | null;
  basis: RangeWindowBasis | null;
  /** |σ × 1e4| between the book's centre and the live spot; the open refuses past `params.maxDriftE4`. */
  driftE4: bigint | null;
  capacity: Diagnosis | null;
  retry: () => void;
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
  const basisQ = useQuery({
    queryKey: [...rangeKeys.all, "basis", band?.marketId ?? "", band?.asset ?? ""],
    queryFn: async () => {
      const r = await previewRangeBasis(band!.marketId, band!.asset);
      return r.ok ? r.value : null;
    },
    enabled: enabled && band !== null,
    refetchInterval: REQUOTE_MS,
  });
  const driftQ = useQuery({
    queryKey: [...rangeKeys.all, "drift", band?.marketId ?? "", spotE8?.toString() ?? ""],
    queryFn: async () => {
      const d = await previewRangeDrift(band!.marketId as Hex, band!.asset, spotE8!);
      return d < 0n ? -d : d;
    },
    enabled: enabled && band !== null && spotE8 !== null,
    staleTime: 10_000,
  });
  const capQ = useQuery({
    queryKey: [...rangeKeys.all, "capacity", quote ? `${quote.maxPayoutBase - quote.stakeBase}` : "", expirySec ?? 0],
    queryFn: async () => {
      const r = await readRangeCapacity(quote!.maxPayoutBase - quote!.stakeBase, expirySec!);
      return r.ok ? r.value.refusal : null;
    },
    enabled: quote !== null && expirySec !== null,
    staleTime: REQUOTE_MS,
  });
  const retry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: rangeKeys.quote(debounced) });
  }, [queryClient, debounced]);
  return {
    quote,
    loading: askable && (!active || reading === null),
    error: active && reading && !reading.ok ? reading.error : null,
    basis: basisQ.data ?? null,
    driftE4: driftQ.data ?? null,
    capacity: capQ.data ?? null,
    retry,
  };
}
