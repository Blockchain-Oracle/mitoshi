"use client";
/**
 * The Range ticket (Ported from Masayume 68f7a09:web/src/features/range/{RangeTicket,BandControl,RangeBuilder}.tsx and
 * `useRangeTicket.ts`): the band around the market, the side, the amount, the chain's quote and the 23527 hold. Used as
 * the markets ticket's Range mode (inside only, as the reference) and on /games/range (inside or outside). Every blocker
 * is the CTA's label (D-045); a stale book (D-119, 2σ from the signed spot) is named.
 * R4-5 (D-227): Owarine 90a91d71's composition — BandCard (anchored band, nudges, spans, inside-now chip) then the
 * TicketStrip action block (Pays ×N, To win, stake chips, the hold, one micro line); the reserve, basis and "at most"
 * lines moved to the page's ⓘ sheet. No churn: a tick never changes the band, and a requote keeps the figures and the
 * hold (only a new blocker replaces it). Signed out, the CTA still reads the order; the hold opens sign-in for it.
 * In a phone sheet the hold sits in the pinned footer (`SheetFooter`, R4-2); on a page or the rail, in place.
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
import { SheetFooter } from "@/components/ui/drawer";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { useNowMs } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { feedKeyOf } from "../markets/units";
import { usd } from "../parlay/format";
import { fetchSpots } from "../parlay/useParlayQuote";
import { BandCard } from "./BandCard";
import { publishBand } from "./band-store";
import { capacityLabel, refusalLabel } from "./blockers";
import { RANGE } from "./copy";
import { usdBand, usdOnGrid, usdToPrint } from "./format";
import { TicketStrip, type SolveMode } from "./TicketStrip";
import { useRangeDraft } from "./useRangeDraft";
import { useRangeQuote } from "./useRangeQuote";
import { useRangeWrites } from "./useRangeWrites";

const BUCKETS = 24;

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
  const [mode, setMode] = useState<SolveMode>("fixStake");
  const [amountText, setAmountText] = useState("5");
  const writes = useRangeWrites(session.address);
  const amountBase = parseDecimalToBaseUnits(amountText || "0", USD_DECIMALS) ?? 0n;
  const band = draft.lowPrint !== null && draft.highPrint !== null ? { marketId: market.marketId, asset: market.asset, side, lowPrint: draft.lowPrint, highPrint: draft.highPrint } : null;
  const q = useRangeQuote({ band, expirySec: market.expirySec, mode: mode === "fixStake" ? { kind: "fixStake", stakeBase: amountBase } : { kind: "fixPayout", maxPayoutBase: amountBase }, params: reserve.params, spotE8, enabled: model !== null && !reserve.paused });
  const quote = q.quote;
  const shown = q.shown;

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
  const signedOut = !session.isConnected;
  // Only a verdict replaces the hold; a requote in flight keeps it (the last quote's figures stay on screen).
  const blocker = ((): string | null => {
    if (reserve.paused) return RANGE.cta.paused;
    if (!model) return RANGE.windows.noModel(market.asset);
    if (spotE8 === null || band === null) return RANGE.cta.waiting;
    if (amountBase === 0n) return RANGE.cta.enterAmount;
    if (q.driftE4 !== null && q.driftE4 > BigInt(reserve.params.maxDriftE4)) return RANGE.cta.stale;
    if (q.error) return refusalLabel(q.error);
    if (!quote) return RANGE.cta.pricing;
    const cap = capacityLabel(q.capacity);
    if (cap) return cap;
    if (!signedOut && spendable !== null && spendable < quote.stakeBase) return RANGE.cta.topUp;
    return null;
  })();
  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  const bandText = band ? `${usdBand(band.lowPrint)}–${usdBand(band.highPrint)}` : "";
  const place = () => {
    if (!quote || !band || !model?.feed || blocker) return;
    if (signedOut) return session.connectFor(RANGE.cta.signInFor(usd(quote.stakeBase), bandText));
    void writes.open({ band, feed: model.feed, maxPayoutBase: quote.maxPayoutBase, maxStakeBase: mulBpsCeil(quote.stakeBase, 10_000 + RANGE_STAKE_HEADROOM_BPS), bandText });
  };
  const pct = shown ? (Number((shown.probRaw * 10_000n) / 1_000_000n) / 100).toFixed(0) : null;

  return (
    <div className="rg flex flex-col gap-3">
      <BandCard asset={market.asset} intervalSec={market.intervalSec} draft={draft} bars={bars} side={side} onSide={allowOutside ? setSide : undefined} openingPrint={q.basis?.openingPrint ?? (market.openingPriceRaw !== null ? market.openingPriceRaw / 1_000_000n : null)} />
      <TicketStrip
        multiplierMilli={shown?.multiplierMilli ?? null}
        sub={pct !== null ? RANGE.ticket.chanceLine(pct, side) : RANGE.ticket.pricingLine}
        toWinBase={shown?.maxPayoutBase ?? null}
        mode={mode}
        onMode={setMode}
        amountText={amountText}
        onAmount={setAmountText}
        stale={quote === null && shown !== null}
      >
        <SheetFooter>
          {busy || writes.fetchingSpot ? (
            <TxCta state={writes.tx} action={writes.fetchingSpot ? RANGE.cta.fetchingSpot : RANGE.cta.placing} signer="passkey" sponsored onConfirm={() => undefined} />
          ) : blocker || !quote ? (
            <button type="button" disabled aria-disabled className="ts-blocked">{blocker ?? RANGE.cta.pricing}</button>
          ) : (
            <HoldToConfirm className="w-full" confirmLabel={signedOut ? RANGE.cta.signingIn : RANGE.cta.placing} onConfirm={place}>
              {RANGE.cta.place(usd(quote.stakeBase), usd(quote.maxPayoutBase))}
            </HoldToConfirm>
          )}
          <p className="ts-micro">{TX.payoutSetAside}</p>
        </SheetFooter>
      </TicketStrip>
      {writes.outcome?.status === "confirmed" ? (
        <div role="status" className="rg-receipt">
          <p className="type-body-strong">{RANGE.outcome.placed(writes.outcome.roundId?.toString() ?? "", bandText, usd(writes.outcome.stakeBase), quote ? usd(quote.maxPayoutBase) : "")}</p>
          <a href={txUrl(writes.outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{RANGE.outcome.viewReceipt}</a>
          <button type="button" className="min-h-touch type-body-strong underline" onClick={writes.reset}>{RANGE.outcome.another}</button>
        </div>
      ) : null}
      {writes.outcome?.status === "requote" ? <p role="alert" className="rg-note rg-note--warn">{TX.requote(usd(writes.outcome.stakeBase))}</p> : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} explorerHref={writes.outcome?.status === "failed" && writes.outcome.txHash ? txUrl(writes.outcome.txHash, webEnv.markets.network) : null} /> : null}
    </div>
  );
}
