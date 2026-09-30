"use client";
/**
 * The ticket's Boost mode (Ported from Masayume 68f7a09:web/src/features/leverage/{useLeverageQuote,useLeverageWrites}.ts
 * and the ticket's `LeverageChips`): the side (16240 pills), the stake (16240 field + chips), the multiple on the 29217
 * slider, the reserve's own sizing (`sizeForStake`) in the 29356 totals — exposure, entry, fronted, premium, the
 * knock-out line, the most you can lose — and the 23527 hold. Named refusals before the hold: the guard's model at the
 * live spot (PD-2), D-116's void bound per multiple, D-114's healthy-at-birth, the reserve's caps. A lazy island.
 */
import { USD_DECIMALS, type EventMarket, type Side } from "@cwf/core";
import { REQUOTE_MS } from "@cwf/core/constants";
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { getLeverageReserveState, previewBoostFair, sizeLeverageForStake } from "@cwf/markets/leverage";
import { readFairModels } from "@cwf/markets/parlay";
import { useAssetPrice, useBalanceSheet, useReadingQuery } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Hex } from "viem";
import { EmptyState, LoadingState } from "@/components/states";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { LeverageSlider } from "@/components/ui/leverage-slider";
import { OrderSummary } from "@/components/ui/order-summary";
import { AmountField, OutcomePills, QuickAdds } from "@/components/ui/prediction-ticket";
import { useNowMs } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { useDebounced } from "../markets/ticket/useDebounced";
import { feedKeyOf } from "../markets/units";
import { formatCents, usd } from "../parlay/format";
import { BOOST } from "./copy";
import { boostKeys, useBoostWrites } from "./useBoostWrites";
import "@/styles/boost.css";

const ADDS = [1, 5, 20] as const;
const PAYOUT_DENOMINATOR = 10_000_000n;
const PAYOUT_VOID = 5_000_000n;

export function BoostTicketMode({ market, side: initialSide }: { market: EventMarket; side: Side | null }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const writes = useBoostWrites(session.address);
  const reserve = useReadingQuery([...boostKeys.all, "reserve"], getLeverageReserveState, { pollMs: 15_000 });
  const models = useQuery({ queryKey: [...boostKeys.all, "model", market.seriesId], queryFn: () => readFairModels([market.seriesId as Hex]), staleTime: 60_000 });
  const [side, setSide] = useState<Side | null>(initialSide);
  const [multiple, setMultiple] = useState(2);
  const [amountText, setAmountText] = useState("2");
  const stakeBase = parseDecimalToBaseUnits(amountText || "0", USD_DECIMALS) ?? 0n;
  const state = reserve?.ok ? reserve.value : null;
  const model = models.data?.get(market.seriesId.toLowerCase()) ?? null;
  const priceable = model !== null && model.sigmaE8 > 0n && model.feed !== null;
  const bps = multiple * 10_000;
  const signature = `${market.marketId}:${side}:${stakeBase}:${bps}`;
  const debounced = useDebounced(signature, 400);
  const askable = state !== null && priceable && side !== null && stakeBase > 0n && multiple > 1 && !state.paused;
  const quoteReading = useReadingQuery([...boostKeys.all, "quote", debounced], () => sizeLeverageForStake(market.marketId, side!, stakeBase, bps, state!.params.maintenanceBps), { enabled: askable && debounced === signature, pollMs: REQUOTE_MS });
  const quote = askable && quoteReading?.ok ? quoteReading.value : null;
  const error = askable && quoteReading && !quoteReading.ok ? quoteReading.error : null;
  const price = useAssetPrice(feedKeyOf(market), nowMs);
  const spotE8 = price?.ok && price.value ? price.value.priceRaw : null;
  const fair = useQuery({ queryKey: [...boostKeys.all, "fair", market.marketId, side ?? "", spotE8?.toString() ?? ""], queryFn: () => previewBoostFair(market.marketId as Hex, side!, spotE8!), enabled: side !== null && spotE8 !== null && priceable, staleTime: 10_000 });
  const spendable = sheet?.ok ? sheet.value.spendableBase : null;

  if (reserve === null || models.isPending) return <LoadingState shape="ticket" />;
  if (!state) return <EmptyState why={BOOST.cta.unavailable} />;
  const maxMultiple = Math.max(1, Math.floor(state.params.maxLeverageBps / 10_000));
  // D-116 on the quoted terms: a void pays half a contract; the front must fit inside it.
  const voidShort = quote !== null && quote.frontedBase * PAYOUT_DENOMINATOR > quote.quantityRaw * PAYOUT_VOID;
  const aboveFair = quote !== null && fair.data != null && quote.priceRaw > fair.data + state.params.fairSlackRaw;
  const blocker = ((): string | null => {
    if (!session.isConnected) return BOOST.cta.signIn;
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
  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  const place = () => {
    if (!quote || !side || !model?.feed || blocker) return;
    void writes.open({ marketId: market.marketId, side, stakeBase: quote.stakeBase, leverageBps: bps, minQuantityRaw: (quote.quantityRaw * 99n) / 100n, feed: model.feed });
  };
  const contracts = (raw: bigint) => formatBaseUnits(raw, USD_DECIMALS, { minDp: 0, maxDp: 2 });

  return (
    <div className="flex flex-col gap-4">
      <OutcomePills label={BOOST.side} value={side} onChange={setSide} outcomes={[{ id: "up", label: BOOST.up, price: "" }, { id: "down", label: BOOST.down, price: "" }]} />
      <div className="flex flex-col gap-2">
        <span className="type-label-micro text-ink-secondary">{BOOST.amount}</span>
        <AmountField value={amountText} onChange={setAmountText} label={BOOST.amount} />
        <QuickAdds adds={ADDS} label={BOOST.quickAdds} onAdd={(n) => setAmountText(String((Number.parseInt(amountText || "0", 10) || 0) + n))} />
      </div>
      <LeverageSlider value={multiple} onChange={setMultiple} max={maxMultiple} label={BOOST.label} valueText={BOOST.valueText} refused={voidShort && multiple === maxMultiple ? { [maxMultiple]: BOOST.refused3x } : {}} />
      <p className="type-caption text-ink-secondary">{multiple > 1 ? BOOST.knockout(multiple) : BOOST.hint}</p>
      <OrderSummary
        title={BOOST.summary}
        rows={[
          { label: BOOST.rows.exposure, value: quote ? BOOST.rows.contracts(contracts(quote.quantityRaw)) : null },
          { label: BOOST.rows.price, value: quote ? formatCents(quote.priceRaw) : null, ...(fair.data != null ? { note: BOOST.rows.model(formatCents(fair.data)) } : {}) },
          { label: BOOST.rows.fronted, value: quote ? usd(quote.frontedBase) : null, tone: "muted" },
          { label: BOOST.rows.premium, value: quote ? usd(quote.premiumBase) : null, tone: "muted" },
          { label: BOOST.rows.line, value: quote ? usd(quote.lineBase) : null },
          { label: BOOST.rows.loss, value: quote ? usd(quote.stakeBase) : null },
        ]}
        total={{ label: BOOST.total, value: quote ? usd(quote.winIfRightBase) : null, tone: "profit" }}
      />
      {!session.isConnected ? (
        <button type="button" onClick={session.connect} className="min-h-touch w-full rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{BOOST.cta.signIn}</button>
      ) : busy || writes.fetchingSpot ? (
        <TxCta state={writes.tx} action={writes.fetchingSpot ? BOOST.cta.fetchingSpot : BOOST.cta.placing} signer="passkey" sponsored onConfirm={() => undefined} />
      ) : blocker ? (
        <button type="button" disabled aria-disabled className="min-h-touch w-full cursor-not-allowed rounded-md border border-hairline bg-surface-2 px-4 type-body-strong text-ink-secondary">{blocker}</button>
      ) : (
        <HoldToConfirm className="w-full" confirmLabel={BOOST.cta.placing} onConfirm={place}>
          {BOOST.cta.place(multiple, usd(quote!.stakeBase))}
        </HoldToConfirm>
      )}
      {session.isConnected && !blocker && !busy ? <p className="text-center type-caption text-ink-secondary">{TX.noFees}</p> : null}
      {writes.outcome?.status === "confirmed" ? (
        <div role="status" className="flex flex-col gap-1 rounded-lg bg-cream p-3 text-cream-ink">
          <p className="type-body-strong">{BOOST.outcome.placed(writes.outcome.positionId?.toString() ?? "", multiple, quote ? contracts(quote.quantityRaw) : "", quote ? usd(quote.stakeBase) : "")}</p>
          <a href={txUrl(writes.outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{BOOST.outcome.viewReceipt}</a>
        </div>
      ) : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} /> : null}
      <p className="type-caption text-ink-secondary">{BOOST.footnote}</p>
    </div>
  );
}

