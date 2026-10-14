"use client";
/**
 * The chain prices the ticket (Ported from Masayume 68f7a09:web/src/features/parlay/useParlayQuote.ts): `previewOpen`
 * through `quoteParlayOnchain`, debounced 400 ms as the reference did, keyed on what is asked and requoted on the
 * ticket's interval. New (PD-2, D-165): the signed RedStone spot for every leg's feed is fetched beside it
 * (`/api/prices/redstone-payload`), and the guard's model for each leg (`previewFairUpE6` at that spot) is compared with
 * the book's price + the reserve's slack — the same floor `openParlay` enforces — so a leg the reserve would refuse is
 * named on the CTA before anyone holds to place. The same payloads are what the open carries when they are fresh.
 * R4-5 (D-227): no flicker. The fair check and the caps keep their last answer for the same legs and amount while a
 * spot refresh or a requote poll re-reads them (they blanked every 15 s and dropped a hold); `shown` keeps the last
 * quote on screen while a changed slip is requoted.
 */
import { REQUOTE_MS } from "@cwf/core/constants";
import type { Diagnosis, ParlayLegInput, ParlayMode, ParlayParams, ParlayQuote } from "@cwf/core";
import { checkParlayCapacity, previewLegFair, quoteParlayOnchain, readParlayExpiryLocked } from "@cwf/markets/parlay";
import { useReadingQuery } from "@cwf/markets/react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { useDebounced } from "../markets/ticket/useDebounced";
import { parlayKeys } from "./data";

const DEBOUNCE_MS = 400;
/** A signed spot is re-read this often while a slip is open; the guard accepts one up to 120 s old. */
const SPOT_REFRESH_MS = 15_000;
/** The guard takes a signed spot up to this old. */
const SPOT_MAX_AGE_MS = 120_000;
/** At the hold, a payload younger than this is sent as is; older, a fresh one is fetched first. */
export const SPOT_REUSE_SEC = 60;

export interface SignedSpot {
  feed: string;
  payload: Hex;
  tSec: number;
  medianE8: bigint;
}

export class SpotsUnavailableError extends Error {}

export async function fetchSpots(feeds: readonly string[]): Promise<Map<string, SignedSpot>> {
  const unique = [...new Set(feeds)];
  const res = await fetch(`/api/prices/redstone-payload?feed=${encodeURIComponent(unique.join(","))}`, { cache: "no-store" });
  if (!res.ok) throw new SpotsUnavailableError(`signed spot ${res.status}`);
  const body = (await res.json()) as { spots: { feed: string; payload: Hex; tSec: number; medianE8: string }[] };
  return new Map(body.spots.map((s) => [s.feed, { feed: s.feed, payload: s.payload, tSec: s.tSec, medianE8: BigInt(s.medianE8) }]));
}

export interface QuoteLeg extends ParlayLegInput {
  feed: string;
  /** The leg's settlement instant (the Window's `expirySec`) — the per-instant cap is checked on it. */
  expirySec: number;
}

const expiriesOf = (legs: readonly QuoteLeg[]) => legs.map((l) => l.expirySec);

export interface FairCheck {
  /** Each leg's fair side probability per whole contract (× 1e6), at the signed spot. */
  fairRaw: bigint[];
  /** The first leg the reserve would refuse `BelowFairValue`, or null. */
  blockedLeg: number | null;
}

/** Keep a previous answer only while it is for the same slip (`signature` leads the key's last part). */
const sameSlip = (signature: string) => <T,>(prev: T | undefined, prevQuery?: { queryKey: QueryKey }): T | undefined =>
  prevQuery && String(prevQuery.queryKey.at(-1)).startsWith(`${signature}|`) ? prev : undefined;

export interface ParlayQuoteState {
  quote: ParlayQuote | null;
  /** `quote`, or the last one while a changed slip is requoted (display only). */
  shown: ParlayQuote | null;
  loading: boolean;
  error: Diagnosis | null;
  fair: FairCheck | null;
  /** The reserve's cap refusal for this ticket (`InsufficientLiquidity`, `OverExposure`, `OverExpiryCap`), or null. */
  capacity: Diagnosis | null;
  /** The busiest leg instant's existing lock, for the stake that fits; null until read. */
  lockedByExpiryBase: bigint | null;
  /** The last quote these legs had, kept through a refusal (the fit's payout per $1). */
  last: ParlayQuote | null;
  spots: Map<string, SignedSpot> | null;
  spotsDown: boolean;
  retry: () => void;
}

export function useParlayQuote({ legs, mode, params, enabled }: { legs: readonly QuoteLeg[]; mode: ParlayMode; params: ParlayParams | null; enabled: boolean }): ParlayQuoteState {
  const queryClient = useQueryClient();
  const amount = mode.kind === "fixStake" ? mode.stakeBase : mode.maxPayoutBase;
  const signature = `${legs.map((l) => `${l.marketId}:${l.side}`).join("|")}|${mode.kind}:${amount}`;
  const debounced = useDebounced(signature, DEBOUNCE_MS);
  const askable = enabled && params !== null && legs.length >= 2 && amount > 0n;
  const active = askable && debounced === signature;
  const reading = useReadingQuery(parlayKeys.quote(debounced), () => quoteParlayOnchain(legs, mode, params!), { enabled: active, pollMs: REQUOTE_MS });
  const quote = active && reading?.ok ? reading.value : null;
  const [last, setLast] = useState<ParlayQuote | null>(null);
  if (quote && quote !== last) setLast(quote);

  const feeds = [...new Set(legs.map((l) => l.feed))].sort();
  const spotsQuery = useQuery({ queryKey: ["cwf", "parlay", "spots", feeds.join(",")], queryFn: () => fetchSpots(feeds), enabled: askable, refetchInterval: SPOT_REFRESH_MS, staleTime: SPOT_REFRESH_MS, retry: 1 });
  const spots = spotsQuery.data ?? null;
  const spotSig = spots ? feeds.map((f) => spots.get(f)?.tSec ?? 0).join(",") : "";
  const fairQuery = useQuery({
    queryKey: parlayKeys.fair(`${signature}|${spotSig}|${quote?.legPricesRaw.join(",") ?? ""}`),
    queryFn: async (): Promise<FairCheck> => {
      const fairRaw = await previewLegFair(legs, legs.map((l) => spots!.get(l.feed)!.medianE8));
      const slack = params!.fairSlackRaw;
      const blocked = quote!.legPricesRaw.findIndex((price, i) => price + slack < fairRaw[i]!);
      return { fairRaw, blockedLeg: blocked < 0 ? null : blocked };
    },
    enabled: quote !== null && spots !== null && legs.every((l) => spots.has(l.feed)),
    staleTime: Infinity,
    placeholderData: sameSlip(signature),
  });

  // The reserve's own caps for this ticket (liquidity, exposure, per instant) — `previewOpen` prices, it doesn't check them.
  const capacity = useQuery({
    queryKey: [...parlayKeys.all, "capacity", quote ? `${quote.maxPayoutBase - quote.stakeBase}|${quote.legPricesRaw.join(",")}|${signature}` : ""],
    queryFn: async () => {
      const [refusal, lockedByExpiryBase] = await Promise.all([checkParlayCapacity(quote!.maxPayoutBase - quote!.stakeBase, expiriesOf(legs)), readParlayExpiryLocked(expiriesOf(legs))]);
      return { refusal, lockedByExpiryBase };
    },
    enabled: quote !== null,
    staleTime: REQUOTE_MS,
    placeholderData: (prev, prevQuery) => (prevQuery && String(prevQuery.queryKey.at(-1)).endsWith(`|${signature}`) ? prev : undefined),
  });

  const retry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: parlayKeys.quote(debounced) });
    void queryClient.invalidateQueries({ queryKey: ["cwf", "parlay", "spots"] });
  }, [queryClient, debounced]);

  const error = active && reading && !reading.ok ? reading.error : null;
  return {
    quote,
    shown: error ? null : (quote ?? last),
    loading: askable && (!active || reading === null),
    error,
    fair: fairQuery.data ?? null,
    capacity: capacity.data?.refusal ?? null,
    lockedByExpiryBase: capacity.data?.lockedByExpiryBase ?? null,
    last,
    spots,
    // R4-5 review: a failed refresh keeps the last payloads (TanStack keeps `data` with `isError`); only none, or none the
    // guard would still take (120 s), is "down" — one failed 15 s refresh no longer swaps the hold for the blocker.
    spotsDown: spotsQuery.isError && (spots === null || Date.now() - spotsQuery.dataUpdatedAt > SPOT_MAX_AGE_MS),
    retry,
  };
}
