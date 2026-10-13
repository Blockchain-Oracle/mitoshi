"use client";
/**
 * The Moonshot ticket (Ported from Masayume 68f7a09:web/src/features/games/moonshot/{MoonshotBuilder,MoonshotTicket,
 * AimControl,useMoonshotQuote}.tsx): call a direction and a reach (×2…×25) on a Window; the house solves the level from
 * the chain's basis and the contract prices the saturated band (`quoteMoonshotOnchain`), so the level, the odds and
 * the multiple are the contract's own. The aim is two segmented controls (23552) in place of Pips' scroll ladder, which
 * had no keyboard path; the rest is the range ticket's composition (16240 chips, 29356 totals, 23527 hold). It opens
 * through the range lane with a signed spot (D-172).
 */
import { USD_DECIMALS, type EventMarket } from "@cwf/core";
import { MOONSHOT_RUNGS, RANGE_STAKE_HEADROOM_BPS, type MoonshotDirection, type MoonshotRung, type RangeReserveState } from "@cwf/core/range";
import { REQUOTE_MS } from "@cwf/core/constants";
import { mulBpsCeil, parseDecimalToBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { quoteMoonshotOnchain, type RangeModel } from "@cwf/markets/range";
import { useBalanceSheet, useReadingQuery } from "@cwf/markets/react";
import { useState } from "react";
import { TxCta, TxFailureCard } from "@/components/tx";
import { TX } from "@/components/tx/copy";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { OrderSummary } from "@/components/ui/order-summary";
import { AmountField, QuickAdds } from "@/components/ui/prediction-ticket";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { useDebounced } from "../../markets/ticket/useDebounced";
import { formatMultiplier, usd } from "../../parlay/format";
import { RANGE } from "../../range/copy";
import { rangeKeys } from "../../range/data";
import { usdBand } from "../../range/format";
import { useRangeWrites } from "../../range/useRangeWrites";
import { callShareInput } from "../../share/call-share";
import { SharePill } from "../../share/SharePill";
import { MOONSHOT } from "./copy";

const ADDS = [1, 5, 20] as const;

export function MoonshotTicket({ market, model, reserve }: { market: EventMarket; model: RangeModel | null; reserve: RangeReserveState }) {
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const writes = useRangeWrites(session.address);
  const [direction, setDirection] = useState<MoonshotDirection>("long");
  const [multiple, setMultiple] = useState<MoonshotRung>(5);
  const [amountText, setAmountText] = useState("2");
  const stakeBase = parseDecimalToBaseUnits(amountText || "0", USD_DECIMALS) ?? 0n;
  const signature = `moonshot:${market.marketId}:${direction}:${multiple}:${stakeBase}`;
  const debounced = useDebounced(signature, 400);
  const active = model !== null && !reserve.paused && stakeBase > 0n && debounced === signature;
  const reading = useReadingQuery(
    rangeKeys.quote(debounced),
    () => quoteMoonshotOnchain({ marketId: market.marketId, asset: market.asset }, { direction, multiple }, { kind: "fixStake", stakeBase }, reserve.params, Math.max(1, market.expirySec - Math.floor(Date.now() / 1000))),
    { enabled: active, pollMs: REQUOTE_MS },
  );
  const q = active && reading?.ok ? reading.value : null;
  const error = active && reading && !reading.ok ? reading.error : null;
  const spendable = sheet?.ok ? sheet.value.spendableBase : null;
  const strike = q ? (direction === "long" ? q.band.lowPrint : q.band.highPrint) : null;

  const blocker = ((): string | null => {
    if (!session.isConnected) return RANGE.cta.signIn;
    if (reserve.paused) return RANGE.cta.paused;
    if (!model) return RANGE.windows.noModel(market.asset);
    if (stakeBase === 0n) return RANGE.cta.enterAmount;
    if (error) return error.errorName === "StaleBasis" ? RANGE.cta.stale : error.errorName === "ThinBook" ? RANGE.cta.thin : error.kind === "reserve-cap" || error.errorName === "OverPayoutCap" ? RANGE.cta.reserveCap : RANGE.cta.unavailable;
    if (!q) return RANGE.cta.pricing;
    if (spendable !== null && spendable < q.quote.stakeBase) return RANGE.cta.topUp;
    return null;
  })();
  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  const target = q && strike !== null ? MOONSHOT.ticket.target(direction, usdBand(strike)) : "";
  const fire = () => {
    if (!q || !model?.feed || blocker) return;
    void writes.open({ band: q.rangeBand, feed: model.feed, maxPayoutBase: q.quote.maxPayoutBase, maxStakeBase: mulBpsCeil(q.quote.stakeBase, 10_000 + RANGE_STAKE_HEADROOM_BPS), bandText: target });
  };
  const placedStakeBase = writes.outcome?.status === "confirmed" ? writes.outcome.stakeBase : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="type-caption text-ink-secondary">{MOONSHOT.aim.must}</p>
      <SegmentedControl<MoonshotDirection> label={MOONSHOT.ticket.direction} value={direction} onValueChange={setDirection} options={[{ value: "long", label: MOONSHOT.aim.long }, { value: "short", label: MOONSHOT.aim.short }]} />
      <SegmentedControl<string> label={MOONSHOT.ticket.reach} value={String(multiple)} onValueChange={(v) => setMultiple(Number(v) as MoonshotRung)} options={MOONSHOT_RUNGS.map((r) => ({ value: String(r), label: MOONSHOT.aim.rung(r) }))} />
      <div className="flex flex-col gap-2">
        <AmountField value={amountText} onChange={setAmountText} label={MOONSHOT.ticket.youPay} />
        <QuickAdds adds={ADDS} label={RANGE.ticket.quickAdds} onAdd={(n) => setAmountText(String((Number.parseInt(amountText || "0", 10) || 0) + n))} />
      </div>
      <OrderSummary
        title={MOONSHOT.ticket.title}
        rows={[
          { label: MOONSHOT.ticket.level, value: strike !== null ? target : null, ...(q ? { note: MOONSHOT.ticket.distance(((Math.abs(Number(strike! - q.openingPrint)) * 100) / Number(q.openingPrint)).toFixed(2), direction === "long") } : {}) },
          { label: MOONSHOT.ticket.pays, value: q ? formatMultiplier(q.quote.multiplierMilli) : null },
          { label: MOONSHOT.ticket.youPay, value: q ? usd(q.quote.stakeBase) : null, ...(q ? { note: RANGE.ticket.atMost(usd(mulBpsCeil(q.quote.stakeBase, 10_000 + RANGE_STAKE_HEADROOM_BPS))) } : {}) },
          { label: RANGE.ticket.house, value: q ? usd(q.houseLockedBase) : null, tone: "muted" },
        ]}
        total={{ label: MOONSHOT.ticket.youWin, value: q ? usd(q.quote.maxPayoutBase) : null, tone: "profit" }}
      />
      {!session.isConnected ? (
        <button type="button" onClick={session.connect} className="min-h-touch w-full rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{RANGE.cta.signIn}</button>
      ) : busy || writes.fetchingSpot ? (
        <TxCta state={writes.tx} action={writes.fetchingSpot ? RANGE.cta.fetchingSpot : MOONSHOT.ticket.placing} signer="passkey" sponsored onConfirm={() => undefined} />
      ) : blocker ? (
        <button type="button" disabled aria-disabled className="min-h-touch w-full cursor-not-allowed rounded-md border border-hairline bg-surface-2 px-4 type-body-strong text-ink-secondary">{blocker}</button>
      ) : (
        <HoldToConfirm className="w-full" confirmLabel={MOONSHOT.ticket.placing} onConfirm={fire}>
          {MOONSHOT.ticket.place2(usd(q!.quote.stakeBase), usd(q!.quote.maxPayoutBase))}
        </HoldToConfirm>
      )}
      {session.isConnected && !blocker && !busy ? <p className="text-center type-caption text-ink-secondary">{TX.noFees}</p> : null}
      {writes.outcome?.status === "confirmed" ? (
        <div role="status" className="rg-receipt">
          <p className="type-body-strong">{RANGE.outcome.placed(writes.outcome.roundId?.toString() ?? "", target, usd(writes.outcome.stakeBase), q ? usd(q.quote.maxPayoutBase) : "")}</p>
          <a href={txUrl(writes.outcome.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{MOONSHOT.ticket.viewTx}</a>
          <SharePill input={() => callShareInput({ call: `${market.asset} MOONSHOT`, band: `${market.asset} ${target}`, stake: placedStakeBase === null ? "" : usd(placedStakeBase), toWin: q ? usd(q.quote.maxPayoutBase) : "", expirySec: market.expirySec, intervalSec: market.intervalSec, path: "/games/moonshot", file: `moonshot-${market.asset.toLowerCase()}` })} />
        </div>
      ) : null}
      {writes.outcome?.status === "requote" ? <p role="alert" className="rg-note rg-note--warn">{RANGE.outcome.requote(usd(writes.outcome.stakeBase))}</p> : null}
      {writes.tx.kind === "failed" ? <TxFailureCard state={writes.tx} onRetry={writes.reset} /> : null}
      <p className="rg-foot">{MOONSHOT.ticket.footnote}</p>
    </div>
  );
}
