"use client";
/**
 * The ticket's Boost mode (Ported from Masayume 68f7a09:web/src/features/leverage/{useLeverageQuote,useLeverageWrites}.ts
 * and the ticket's `LeverageChips`): the side (16240 pills), the stake (16240 field + chips), the multiple on the 29217
 * slider, the reserve's own sizing (`sizeForStake`) in the 29356 totals — exposure, entry, fronted, premium, the
 * knock-out line, the most you can lose — and the 23527 hold. Named refusals before the hold: the guard's model at the
 * live spot (PD-2), D-116's void bound per multiple, D-114's healthy-at-birth, the reserve's caps. A lazy island.
 * R4-2 (D-227): the hold sits in the phone sheet's pinned footer (`SheetFooter`), in place on the rail.
 */
import { USD_DECIMALS, type EventMarket, type Side } from "@cwf/core";
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { useState } from "react";
import { EmptyState, LoadingState } from "@/components/states";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { SheetFooter } from "@/components/ui/overlay-footer";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { LeverageSlider } from "@/components/ui/leverage-slider";
import { OrderSummary } from "@/components/ui/order-summary";
import { AmountField, OutcomePills, QuickAdds } from "@/components/ui/prediction-ticket";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { formatCents, usd } from "../parlay/format";
import { BOOST } from "./copy";
import { useBoostTicket } from "./useBoostTicket";
import { useBoostWrites } from "./useBoostWrites";
import "@/styles/boost.css";

const ADDS = [1, 5, 20] as const;

export function BoostTicketMode({ market, side: initialSide }: { market: EventMarket; side: Side | null }) {
  const session = useWalletSession();
  const writes = useBoostWrites(session.address);
  const [side, setSide] = useState<Side | null>(initialSide);
  const [multiple, setMultiple] = useState(2);
  const [amountText, setAmountText] = useState("2");
  const stakeBase = parseDecimalToBaseUnits(amountText || "0", USD_DECIMALS) ?? 0n;
  const t = useBoostTicket({ market, side, stakeBase, multiple });
  const { quote, blocker, maxMultiple, voidShort, fair } = t;

  if (t.loading) return <LoadingState shape="ticket" />;
  if (!t.state) return <EmptyState why={BOOST.cta.unavailable} />;
  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  const place = () => {
    if (t.openArgs) void writes.open(t.openArgs);
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
          { label: BOOST.rows.price, value: quote ? formatCents(quote.priceRaw) : null, ...(fair !== null ? { note: BOOST.rows.model(formatCents(fair)) } : {}) },
          { label: BOOST.rows.fronted, value: quote ? usd(quote.frontedBase) : null, tone: "muted" },
          { label: BOOST.rows.premium, value: quote ? usd(quote.premiumBase) : null, tone: "muted" },
          { label: BOOST.rows.line, value: quote ? usd(quote.lineBase) : null },
          { label: BOOST.rows.loss, value: quote ? usd(quote.stakeBase) : null },
        ]}
        total={{ label: BOOST.total, value: quote ? usd(quote.winIfRightBase) : null, tone: "profit" }}
      />
      <SheetFooter>
        {!session.isConnected ? (
          <button type="button" onClick={() => session.connectFor(BOOST.cta.signInFor)} className="min-h-touch w-full rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{BOOST.cta.signIn}</button>
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
      </SheetFooter>
      {writes.outcome?.status === "confirmed" ? (
        <div role="status" className="flex flex-col gap-1 rounded-lg bg-cream p-3 text-cream-ink">
          {writes.outcome.booked ? <p className="type-body-strong">{BOOST.outcome.placed(writes.outcome.booked.positionId.toString(), writes.outcome.booked.leverageBps / 10_000, contracts(writes.outcome.booked.quantityRaw), usd(writes.outcome.booked.stakeBase))}</p> : <p className="type-body-strong">{BOOST.outcome.placedUnread}</p>}
          <a href={txUrl(writes.outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{BOOST.outcome.viewReceipt}</a>
        </div>
      ) : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} /> : null}
      <p className="type-caption text-ink-secondary">{BOOST.footnote}</p>
    </div>
  );
}

