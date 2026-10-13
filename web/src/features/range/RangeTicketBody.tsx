"use client";
/**
 * The Range ticket (Ported from Masayume 68f7a09:web/src/features/range/{RangeTicket,BandControl,RangeBuilder}.tsx and
 * `useRangeTicket.ts`): the band around the live price — presets, the two-thumb slider over the model's distribution
 * (21st 31347 + 32784, `BandSlider`) — the side, the amount (16240 chips), the chain's quote in the 29356 totals, and
 * the 23527 hold. Used as the markets ticket's Range mode (inside only, as the reference) and on /games/range (inside
 * or outside). Every blocker is the CTA's label (D-045); a stale book (D-119, 2σ from the signed spot) is named.
 * R4-2 (D-227): in a phone sheet the hold sits in the pinned footer (`SheetFooter`); on a page or the rail, in place.
 */
import { USD_DECIMALS, type EventMarket } from "@cwf/core";
import { bandProbE6, RANGE_STAKE_HEADROOM_BPS, type RangeReserveState, type RangeSide } from "@cwf/core/range";
import { mulBpsCeil, parseDecimalToBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import type { RangeModel } from "@cwf/markets/range";
import { useAssetPrice, useBalanceSheet } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { BandSlider } from "@/components/ui/band-slider";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { OrderSummary } from "@/components/ui/order-summary";
import { AmountField, QuickAdds } from "@/components/ui/prediction-ticket";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useNowMs } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { feedKeyOf } from "../markets/units";
import { SharePill } from "../share/SharePill";
import { formatMultiplier, usd } from "../parlay/format";
import { fetchSpots } from "../parlay/useParlayQuote";
import { publishBand } from "./band-store";
import { RANGE } from "./copy";
import { usdBand, usdOnGrid, usdToPrint, utilizationPct } from "./format";
import { RANGE_PRESETS, type RangePresetKey } from "./presets";
import { rangeShare } from "./range-share";
import { useRangeDraft } from "./useRangeDraft";
import { useRangeQuote } from "./useRangeQuote";
import { useRangeWrites } from "./useRangeWrites";

const BUCKETS = 24;
const ADDS = [1, 5, 20] as const;

export function RangeTicketBody({ market, model, reserve, allowOutside = false, drawOnChart = false }: { market: EventMarket; model: RangeModel | null; reserve: RangeReserveState; allowOutside?: boolean; drawOnChart?: boolean }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const price = useAssetPrice(feedKeyOf(market), nowMs);
  // The live price from the stream; when the stream has none (between ticks, or no ops stream), the signed RedStone
  // median the open's own proof comes from — the same real price, never a placeholder.
  const signed = useQuery({ queryKey: ["cwf", "range", "spot", model?.feed ?? ""], queryFn: async () => (await fetchSpots([model!.feed!])).get(model!.feed!)!.medianE8, enabled: model?.feed != null && !(price?.ok && price.value), refetchInterval: 15_000 });
  const spotE8 = price?.ok && price.value ? price.value.priceRaw : (signed.data ?? null);
  const draft = useRangeDraft(spotE8 === null ? null : spotE8 / 1_000_000n, market.intervalSec);
  const [side, setSide] = useState<RangeSide>("inside");
  const [mode, setMode] = useState<"fixStake" | "fixPayout">("fixStake");
  const [amountText, setAmountText] = useState("5");
  const writes = useRangeWrites(session.address);
  const amountBase = parseDecimalToBaseUnits(amountText || "0", USD_DECIMALS) ?? 0n;
  const band = draft.lowPrint !== null && draft.highPrint !== null ? { marketId: market.marketId, asset: market.asset, side, lowPrint: draft.lowPrint, highPrint: draft.highPrint } : null;
  const q = useRangeQuote({ band, expirySec: market.expirySec, mode: mode === "fixStake" ? { kind: "fixStake", stakeBase: amountBase } : { kind: "fixPayout", maxPayoutBase: amountBase }, params: reserve.params, spotE8, enabled: model !== null && !reserve.paused });
  const quote = q.quote;

  useEffect(() => {
    if (!drawOnChart) return;
    publishBand(band ? { marketId: market.marketId, lowE8: band.lowPrint * 1_000_000n, highE8: band.highPrint * 1_000_000n, side } : null);
  }, [drawOnChart, band?.lowPrint, band?.highPrint, side, market.marketId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => publishBand(null), []);

  const bars = useMemo(() => {
    const b = q.basis;
    if (!b || !draft.axis) return [];
    const step = (draft.axis.max - draft.axis.min) / BUCKETS;
    const tau = Math.max(1, market.expirySec - Math.floor(Date.now() / 1000));
    return Array.from({ length: BUCKETS }, (_, i) => {
      const lo = draft.axis!.min + i * step;
      const w = bandProbE6(b.openingPrint, usdToPrint(lo), usdToPrint(lo + step), b.centerQE6, b.sigmaE8, tau);
      return { at: lo + step / 2, weight: Number(w), label: `${usdOnGrid(lo, draft.decimals)}–${usdOnGrid(lo + step, draft.decimals)}` };
    });
  }, [q.basis, draft.axis, draft.decimals, market.expirySec]);

  const spendable = sheet?.ok ? sheet.value.spendableBase : null;
  const blocker = ((): string | null => {
    if (!session.isConnected) return RANGE.cta.signIn;
    if (reserve.paused) return RANGE.cta.paused;
    if (!model) return RANGE.windows.noModel(market.asset);
    if (spotE8 === null || band === null) return RANGE.cta.waiting;
    if (amountBase === 0n) return RANGE.cta.enterAmount;
    if (q.driftE4 !== null && q.driftE4 > BigInt(reserve.params.maxDriftE4)) return RANGE.cta.stale;
    if (q.error) {
      const n = q.error.errorName;
      if (n === "ThinBook") return RANGE.cta.thin;
      if (n === "WideBook") return RANGE.cta.wide;
      if (n === "WindowDecided") return RANGE.cta.decided;
      if (n === "LongShot") return RANGE.cta.longShot;
      if (n === "NearCertain") return RANGE.cta.nearCertain;
      if (n === "TooLate") return RANGE.cta.tooLate;
      if (n === "StaleBasis") return RANGE.cta.stale;
      if (q.error.kind === "reserve-cap") return RANGE.cta.reserveCap;
      return RANGE.cta.unavailable;
    }
    if (q.loading || !quote) return RANGE.cta.pricing;
    if (q.capacity) return RANGE.cta.reserveCap;
    if (spendable !== null && spendable < quote.stakeBase) return RANGE.cta.topUp;
    return null;
  })();
  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  const bandText = band ? `${usdBand(band.lowPrint)}–${usdBand(band.highPrint)}` : "";
  const place = () => {
    if (!quote || !band || !model?.feed || blocker) return;
    void writes.open({ band, feed: model.feed, maxPayoutBase: quote.maxPayoutBase, maxStakeBase: mulBpsCeil(quote.stakeBase, 10_000 + RANGE_STAKE_HEADROOM_BPS), bandText, expirySec: market.expirySec });
  };
  const insidePct = quote ? Number((quote.probRaw * 10_000n) / 1_000_000n) / 100 : null;
  const placed = writes.outcome?.status === "confirmed" ? writes.outcome : null;

  return (
    <div className="rg flex flex-col gap-4">
      <p className="type-caption text-ink-secondary">{RANGE.band.mustFinish(market.asset, side)}</p>
      {allowOutside ? (
        <SegmentedControl<RangeSide> label={RANGE.band.sideLabel} value={side} onValueChange={setSide} options={[{ value: "inside", label: RANGE.band.inside }, { value: "outside", label: RANGE.band.outside }]} />
      ) : null}
      <SegmentedControl<RangePresetKey> label={RANGE.band.width} value={draft.preset} onValueChange={draft.setPreset} options={RANGE_PRESETS.map((p) => ({ value: p.key, label: RANGE.band.presets[p.key] }))} />
      {draft.axis && draft.lowUsd !== null && draft.highUsd !== null ? (
        <BandSlider
          min={draft.axis.min}
          max={draft.axis.max}
          step={draft.unit}
          value={[draft.lowUsd, draft.highUsd]}
          onChange={([lo, hi]) => draft.setEdges(lo, hi)}
          bars={bars}
          format={(v) => usdOnGrid(v, draft.decimals)}
          label={RANGE.band.bars(market.asset)}
          lowLabel={RANGE.band.low}
          highLabel={RANGE.band.high}
          marker={draft.spotUsd}
          markerLabel={draft.spotUsd !== null ? `${RANGE.band.now(market.asset)} ${usdOnGrid(draft.spotUsd, draft.decimals)}` : undefined}
        />
      ) : (
        <p role="status" className="type-caption text-ink-secondary">{RANGE.band.waiting}</p>
      )}
      <SegmentedControl<"fixStake" | "fixPayout"> label={RANGE.ticket.setStake} value={mode} onValueChange={setMode} options={[{ value: "fixStake", label: RANGE.ticket.setStake }, { value: "fixPayout", label: RANGE.ticket.setPayout }]} />
      <div className="flex flex-col gap-2">
        <AmountField value={amountText} onChange={setAmountText} label={mode === "fixStake" ? RANGE.ticket.stake : RANGE.ticket.total} />
        <QuickAdds adds={ADDS} label={RANGE.ticket.quickAdds} onAdd={(n) => setAmountText(String((Number.parseInt(amountText || "0", 10) || 0) + n))} />
      </div>
      <OrderSummary
        title={RANGE.ticket.summary}
        rows={[
          { label: RANGE.ticket.chance, value: insidePct !== null ? `${insidePct.toFixed(2)}%` : null, ...(q.basis ? { note: RANGE.ticket.basis(usdBand(q.basis.openingPrint), (Number(q.basis.centerQE6) / 10_000).toFixed(1)) } : {}) },
          { label: RANGE.ticket.pays, value: quote ? formatMultiplier(quote.multiplierMilli) : null },
          { label: RANGE.ticket.stake, value: quote ? usd(quote.stakeBase) : null, ...(quote ? { note: RANGE.ticket.atMost(usd(mulBpsCeil(quote.stakeBase, 10_000 + RANGE_STAKE_HEADROOM_BPS))) } : {}) },
          { label: RANGE.ticket.house, value: quote ? usd(quote.maxPayoutBase - quote.stakeBase) : null, tone: "muted" },
        ]}
        total={{ label: RANGE.ticket.total, value: quote ? usd(quote.maxPayoutBase) : null, tone: "profit" }}
      />
      <SheetFooter>
        {!session.isConnected ? (
          <button type="button" onClick={session.connect} className="min-h-touch w-full rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{RANGE.cta.signIn}</button>
        ) : busy || writes.fetchingSpot ? (
          <TxCta state={writes.tx} action={writes.fetchingSpot ? RANGE.cta.fetchingSpot : RANGE.cta.placing} signer="passkey" sponsored onConfirm={() => undefined} />
        ) : blocker ? (
          <button type="button" disabled aria-disabled className="min-h-touch w-full cursor-not-allowed rounded-md border border-hairline bg-surface-2 px-4 type-body-strong text-ink-secondary">{blocker}</button>
        ) : (
          <HoldToConfirm className="w-full" confirmLabel={RANGE.cta.placing} onConfirm={place}>
            {RANGE.cta.place(usd(quote!.stakeBase), usd(quote!.maxPayoutBase))}
          </HoldToConfirm>
        )}
        {session.isConnected && !blocker && !busy ? <p className="text-center type-caption text-ink-secondary">{TX.noFees}</p> : null}
      </SheetFooter>
      {placed ? (
        <div role="status" className="rg-receipt">
          <p className="type-body-strong">{RANGE.outcome.placed(placed.roundId?.toString() ?? "", placed.bandText, usd(placed.stakeBase), usd(placed.payoutBase))}</p>
          <a href={txUrl(placed.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{RANGE.outcome.viewReceipt}</a>
          <button type="button" className="min-h-touch type-body-strong underline" onClick={writes.reset}>{RANGE.outcome.another}</button>
          <SharePill input={() => rangeShare(placed, market, "range", `/trade/${market.asset}`)} />
        </div>
      ) : null}
      {writes.outcome?.status === "requote" ? <p role="alert" className="rg-note rg-note--warn">{RANGE.outcome.requote(usd(writes.outcome.stakeBase))}</p> : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} explorerHref={writes.outcome?.status === "failed" && writes.outcome.txHash ? txUrl(writes.outcome.txHash, webEnv.markets.network) : null} /> : null}
      <p className="rg-foot">
        {RANGE.ticket.footnote}
        <br />
        {RANGE.ticket.reserve(usd(reserve.liquidBase), utilizationPct(reserve.utilizationBps))}
      </p>
    </div>
  );
}
