"use client";
/**
 * The slip (E.4 composition): the legs (21st 109 + 29940), the solve mode (23552 segmented control), the amount and its
 * chips (the 16240 ticket's `AmountField`/`QuickAdds`), the totals (29356 `OrderSummary`) and the place control (23527
 * `HoldToConfirm`), inside the rail from `lg` or the right-edge slide-over below it (`SlipDock`). Ported from Masayume
 * 68f7a09:web/src/features/parlay/ParlayTicket.tsx (the multiplier, the solver, the breakdown, the place ladder, the
 * footnotes) with the ux-audit fixes: the CTA names its blocker instead of greying out (D-045), every wait is named,
 * a failure says whether money moved, and a requote asks again at the new figure. R4-2 (D-227): in the slide-over the
 * place control sits in the pinned footer (`SheetFooter`), above a phone's keyboard; on the rail, in place.
 */
import { oneUnit, parseDecimalToBaseUnits, mulBpsCeil } from "@cwf/core/units";
import { USD_DECIMALS, type ParlayMode, type ParlayReserveState } from "@cwf/core";
import { parseRefusal } from "@cwf/markets/parlay";
import { useBalanceSheet } from "@cwf/markets/react";
import { webEnv } from "@/lib/env";
import { txUrl } from "@cwf/core/urls";
import { useMemo } from "react";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { OrderSummary } from "@/components/ui/order-summary";
import { AmountField, QuickAdds } from "@/components/ui/prediction-ticket";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useWalletSession } from "@/lib/wallet-session";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { formatMultiplier, formatProbPct, usd, utilizationPct } from "./format";
import { SlipLegs } from "./SlipLegs";
import { useSlip, type SolveMode } from "./slip-state";
import { useParlayQuote } from "./useParlayQuote";
import { useParlayWrites } from "./useParlayWrites";

/** The Range lane's headroom (Masayume `RANGE_STAKE_HEADROOM_BPS`): a quote that drifts a hair before it lands is still the deal shown. */
const STAKE_HEADROOM_BPS = 100;
const ONE = oneUnit(USD_DECIMALS);
const ADDS = [1, 5, 20] as const;

export function ParlaySlip({ reserve, windows }: { reserve: ParlayReserveState; windows: readonly LegWindow[] }) {
  const slip = useSlip();
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const writes = useParlayWrites(session.address);
  const amountBase = parseDecimalToBaseUnits(slip.amountText || "0", USD_DECIMALS) ?? 0n;
  const mode: ParlayMode = slip.mode === "fixStake" ? { kind: "fixStake", stakeBase: amountBase } : { kind: "fixPayout", maxPayoutBase: amountBase };
  const legs = useMemo(() => {
    const byId = new Map(windows.map((w) => [w.market.marketId, w.market.expirySec]));
    return slip.legs.map((l) => ({ marketId: l.marketId, side: l.side, feed: l.feed, expirySec: byId.get(l.marketId) ?? 0 }));
  }, [slip.legs, windows]);
  const q = useParlayQuote({ legs, mode, params: reserve.params, enabled: !reserve.paused });
  const quote = q.quote;
  const refusal = parseRefusal(q.error);
  const figures = slip.legs.map((_, i) => ({ priceRaw: quote?.legPricesRaw[i] ?? null, fairRaw: q.fair?.fairRaw[i] ?? null }));
  const spendable = sheet?.ok ? sheet.value.spendableBase : null;

  const blocker = ((): string | null => {
    if (!session.isConnected) return PARLAY.cta.signIn;
    if (reserve.paused) return PARLAY.cta.paused;
    if (slip.legs.length < 2) return PARLAY.cta.needTwo;
    if (amountBase === 0n) return PARLAY.cta.enterAmount;
    if (q.error) {
      if (refusal?.kind === "thin-book") return PARLAY.cta.thinShort(slip.legs.findIndex((l) => l.marketId.toLowerCase() === refusal.marketId.toLowerCase()) + 1);
      if (q.error.kind === "reserve-cap") return PARLAY.cta.reserveCap;
      if (q.error.errorName === "LongShot") return PARLAY.cta.longShot;
      return PARLAY.cta.unavailable;
    }
    if (q.loading || !quote) return PARLAY.cta.pricing;
    if (q.capacity) return q.capacity.kind === "reserve-cap" ? PARLAY.cta.reserveCap : PARLAY.cta.unavailable;
    if (q.spotsDown) return PARLAY.cta.spotsDown;
    if (q.fair?.blockedLeg != null) return PARLAY.cta.belowFairShort(q.fair.blockedLeg + 1);
    if (!q.fair) return PARLAY.cta.pricing;
    if (spendable !== null && spendable < quote.stakeBase) return PARLAY.cta.topUp;
    return null;
  })();

  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  const place = () => {
    if (!quote || blocker) return;
    void writes.open({ legs, maxPayoutBase: quote.maxPayoutBase, maxStakeBase: mulBpsCeil(quote.stakeBase, 10_000 + STAKE_HEADROOM_BPS), spots: q.spots });
  };
  const houseBase = quote ? quote.maxPayoutBase - quote.stakeBase : null;
  const outcome = writes.outcome;

  return (
    <div className="ps">
      {slip.legs.length === 0 ? <p className="ps-empty">{PARLAY.slip.empty}</p> : <SlipLegs windows={windows} figures={figures} refusal={refusal} />}
      {slip.legs.length === 1 ? <p className="ps-empty">{PARLAY.slip.needOneMore}</p> : null}

      <SegmentedControl<SolveMode>
        label={PARLAY.slip.setStake}
        value={slip.mode}
        onValueChange={slip.setMode}
        options={[
          { value: "fixStake", label: PARLAY.slip.setStake },
          { value: "fixPayout", label: PARLAY.slip.setPayout },
        ]}
      />
      <div className="ps-amount">
        <span className="type-label-micro text-ink-secondary">{slip.mode === "fixStake" ? PARLAY.slip.stake : PARLAY.slip.payout}</span>
        <AmountField value={slip.amountText} onChange={slip.setAmountText} label={slip.mode === "fixStake" ? PARLAY.slip.stake : PARLAY.slip.payout} />
        <QuickAdds adds={ADDS} label={PARLAY.slip.quickAdds} onAdd={(n) => slip.setAmountText(String((Number.parseInt(slip.amountText || "0", 10) || 0) + n))} />
      </div>

      <OrderSummary
        title={PARLAY.slip.summary}
        rows={[
          { label: PARLAY.slip.rows.legs, value: quote ? formatProbPct(quote.combinedProbRaw, ONE) : null, ...(quote?.correlated ? { note: PARLAY.slip.rows.correlated } : {}) },
          { label: PARLAY.slip.rows.multiplier, value: quote ? formatMultiplier(quote.multiplierMilli) : null },
          { label: PARLAY.slip.rows.stake, value: quote ? usd(quote.stakeBase) : null },
          { label: PARLAY.slip.rows.house, value: houseBase !== null ? usd(houseBase) : null, tone: "muted" },
        ]}
        total={{ label: PARLAY.slip.payoutTotal, value: quote ? usd(quote.maxPayoutBase) : null, tone: "profit" }}
      />

      <SheetFooter>
        {!session.isConnected ? (
          <button type="button" onClick={() => session.connectFor(PARLAY.cta.signInFor)} className="min-h-touch w-full rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{PARLAY.cta.signIn}</button>
        ) : busy || writes.fetchingSpots ? (
          <TxCta state={writes.tx} action={writes.fetchingSpots ? PARLAY.cta.fetchingSpots : PARLAY.cta.placing} signer="passkey" sponsored onConfirm={() => undefined} />
        ) : blocker ? (
          <button type="button" disabled aria-disabled className="min-h-touch w-full cursor-not-allowed rounded-md border border-hairline bg-surface-2 px-4 type-body-strong text-ink-secondary">{blocker}</button>
        ) : (
          <HoldToConfirm className="w-full" confirmLabel={PARLAY.cta.placing} onConfirm={place}>
            {PARLAY.cta.place(usd(quote!.stakeBase), usd(quote!.maxPayoutBase))}
          </HoldToConfirm>
        )}
        {session.isConnected && !blocker && !busy ? <p className="text-center type-caption text-ink-secondary">{TX.noFees}</p> : null}
      </SheetFooter>

      {outcome?.status === "confirmed" ? (
        <div role="status" className="ps-receipt">
          <p className="type-body-strong text-ink">{PARLAY.outcome.placed(outcome.parlayId?.toString() ?? "", slip.legs.length, usd(outcome.stakeBase), quote ? usd(quote.maxPayoutBase) : "")}</p>
          <a href={txUrl(outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption text-cream-ink underline">{PARLAY.outcome.viewReceipt}</a>
          <button type="button" className="min-h-touch type-body-strong text-ink underline" onClick={() => { writes.reset(); slip.clear(); }}>{PARLAY.outcome.another}</button>
        </div>
      ) : null}
      {outcome?.status === "requote" ? <p role="alert" className="ps-note ps-note--warn">{PARLAY.outcome.requote(usd(outcome.stakeBase))}</p> : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} explorerHref={outcome?.status === "failed" && outcome.txHash ? txUrl(outcome.txHash, webEnv.markets.network) : null} /> : null}

      <p className="ps-foot">
        {PARLAY.footnote}
        <br />
        {PARLAY.reserve(usd(reserve.liquidBase), utilizationPct(reserve.utilizationBps))}
      </p>
    </div>
  );
}
