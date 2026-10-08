"use client";
/**
 * The Boost terms for one Window, side, stake and multiple — extracted from `BoostTicketMode` (Masayume 68f7a09's
 * `useLeverageQuote`) so the terminal's UP/DOWN (S23i) and the ticket share them: the reserve's state and its own
 * sizing (`sizeForStake`), the guard's model at the live spot (PD-2), D-116's void bound, D-114's healthy-at-birth and
 * the reserve's caps, each refusal named in the CTA's words before anything is signed.
 */
import type { EventMarket, Side } from "@cwf/core";
import { REQUOTE_MS } from "@cwf/core/constants";
import { getLeverageReserveState, previewBoostFair, sizeLeverageForStake } from "@cwf/markets/leverage";
import { readFairModels } from "@cwf/markets/parlay";
import { useAssetPrice, useBalanceSheet, useReadingQuery } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { useDebounced } from "../markets/ticket/useDebounced";
import { feedKeyOf } from "../markets/units";
import { BOOST } from "./copy";
import { boostKeys } from "./useBoostWrites";

const PAYOUT_DENOMINATOR = 10_000_000n;
const PAYOUT_VOID = 5_000_000n;

export function useBoostTicket({ market, side, stakeBase, multiple, enabled = true }: { market: EventMarket | null; side: Side | null; stakeBase: bigint; multiple: number; enabled?: boolean }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const reserve = useReadingQuery([...boostKeys.all, "reserve"], getLeverageReserveState, { pollMs: 15_000, enabled });
  const models = useQuery({ queryKey: [...boostKeys.all, "model", market?.seriesId ?? ""], queryFn: () => readFairModels([market!.seriesId as Hex]), staleTime: 60_000, enabled: enabled && market !== null });
  const state = reserve?.ok ? reserve.value : null;
  const model = market ? (models.data?.get(market.seriesId.toLowerCase()) ?? null) : null;
  const priceable = model !== null && model.sigmaE8 > 0n && model.feed !== null;
  const bps = multiple * 10_000;
  const signature = `${market?.marketId}:${side}:${stakeBase}:${bps}`;
  const debounced = useDebounced(signature, 400);
  const askable = enabled && market !== null && state !== null && priceable && side !== null && stakeBase > 0n && multiple > 1 && !state.paused;
  const quoteReading = useReadingQuery([...boostKeys.all, "quote", debounced], () => sizeLeverageForStake(market!.marketId, side!, stakeBase, bps, state!.params.maintenanceBps), { enabled: askable && debounced === signature, pollMs: REQUOTE_MS });
  const quote = askable && quoteReading?.ok ? quoteReading.value : null;
  const error = askable && quoteReading && !quoteReading.ok ? quoteReading.error : null;
  const price = useAssetPrice(market ? feedKeyOf(market) : null, nowMs);
  const spotE8 = price?.ok && price.value ? price.value.priceRaw : null;
  const fair = useQuery({ queryKey: [...boostKeys.all, "fair", market?.marketId ?? "", side ?? "", spotE8?.toString() ?? ""], queryFn: () => previewBoostFair(market!.marketId as Hex, side!, spotE8!), enabled: enabled && market !== null && side !== null && spotE8 !== null && priceable, staleTime: 10_000 });
  const spendable = sheet?.ok ? sheet.value.spendableBase : null;

  const maxMultiple = state ? Math.max(1, Math.floor(state.params.maxLeverageBps / 10_000)) : 1;
  // D-116 on the quoted terms: a void pays half a contract; the front must fit inside it.
  const voidShort = quote !== null && quote.frontedBase * PAYOUT_DENOMINATOR > quote.quantityRaw * PAYOUT_VOID;
  const aboveFair = quote !== null && state !== null && fair.data != null && quote.priceRaw > fair.data + state.params.fairSlackRaw;
  const blocker = ((): string | null => {
    if (!session.isConnected) return BOOST.cta.signIn;
    if (!state) return BOOST.cta.unavailable;
    if (state.paused) return BOOST.cta.paused;
    if (!priceable) return BOOST.cta.noModel;
    if (side === null) return BOOST.cta.pickSide;
    if (stakeBase === 0n) return BOOST.cta.enterAmount;
    if (multiple === 1) return BOOST.cta.one;
    if (error) {
      const n = error.errorName;
      if (n === "ThinBook") return BOOST.cta.thin;
      if (n === "UnhealthyAtEntry") return BOOST.cta.unhealthy;
      if (n === "VoidWouldShort") return BOOST.cta.voidShort;
      if (n === "AboveFairValue") return BOOST.cta.aboveFair;
      if (n === "OutsideBand") return BOOST.cta.outsideBand;
      if (n === "TooLate") return BOOST.cta.tooLate;
      if (error.kind === "reserve-cap") return BOOST.cta.reserveCap;
      return BOOST.cta.unavailable;
    }
    if (!quote) return BOOST.cta.pricing;
    if (voidShort) return BOOST.cta.voidShort;
    if (aboveFair) return BOOST.cta.aboveFair;
    if (spendable !== null && spendable < quote.stakeBase) return BOOST.cta.topUp;
    return null;
  })();
  return {
    loading: enabled && (reserve === null || models.isPending),
    state,
    model,
    quote,
    fair: fair.data ?? null,
    maxMultiple,
    voidShort,
    blocker,
    /** The open's terms, once nothing is in the way: the quoted stake, 1 % of slack on the size, the feed to prove. */
    openArgs: quote && side && model?.feed && !blocker && market ? { marketId: market.marketId, side, stakeBase: quote.stakeBase, leverageBps: bps, minQuantityRaw: (quote.quantityRaw * 99n) / 100n, feed: model.feed } : null,
  };
}
