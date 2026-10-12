"use client";
/**
 * The ticket's Private mode (Ported from Masayume 68f7a09:web/src/features/private/{usePrivateTicket,PrivateTicketParts,
 * private-blocker}.ts): the side (16240 pills), the stake (16240 field + chips), the desk contract's own sizing
 * (`sizeForStake`) in the 29356 totals, the budget line with its one fix (add to the private balance, or re-allow the
 * desk), then the 23527 hold → one passkey prompt over the bet's text → the desk places it (D-171). Always 1×. A lazy
 * island. R4-2 (D-227): the hold sits in the phone sheet's pinned footer (`SheetFooter`), in place on the rail.
 */
import { USD_DECIMALS, type EventMarket, type Side } from "@cwf/core";
import { REQUOTE_MS } from "@cwf/core/constants";
import type { PrivateOpenResult } from "@cwf/core/private";
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { txUrl } from "@cwf/core/urls";
import { sizePrivateForStake } from "@cwf/markets/private";
import { useBalanceSheet, useReadingQuery } from "@cwf/markets/react";
import { useState } from "react";
import { SheetFooter } from "@/components/ui/drawer";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { OrderSummary } from "@/components/ui/order-summary";
import { AmountField, OutcomePills, QuickAdds } from "@/components/ui/prediction-ticket";
import { useNowMs } from "@/lib/clock";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { useDebounced } from "../markets/ticket/useDebounced";
import { formatCents, usd } from "../parlay/format";
import { PRIVATE } from "./copy";
import { privateKeys, usePrivateActions, usePrivateBudget, usePrivateClaims, usePrivateStatus } from "./usePrivate";
import "@/styles/private.css";

const ADDS = [1, 5, 20] as const;
/** The desk refunds a fill more than 5% under the size quoted when the passkey signed. */
const FILL_FLOOR_BPS = 9_500n;
/** A top-up covers a few bets' worth — four stakes — never more than the wallet holds (the reference's rule). */
const TOP_UP_STAKES = 4n;
const LOCK_GUARD_SEC = 60;

export function PrivateTicketMode({ market, side: initialSide }: { market: EventMarket; side: Side | null }) {
  const nowSec = Math.floor(useNowMs() / 1000);
  const session = useWalletSession();
  const owner = session.address;
  const status = usePrivateStatus();
  const budgetReading = usePrivateBudget(owner);
  const claims = usePrivateClaims(owner);
  const sheet = useBalanceSheet(owner);
  const actions = usePrivateActions(owner);
  const [side, setSide] = useState<Side | null>(initialSide);
  const [amountText, setAmountText] = useState("2");
  const [result, setResult] = useState<PrivateOpenResult | null>(null);
  const stakeBase = parseDecimalToBaseUnits(amountText || "0", USD_DECIMALS) ?? 0n;
  const ready = status.data?.ready === true;
  const signature = `${market.marketId}:${side}:${stakeBase}`;
  const debounced = useDebounced(signature, 400);
  const askable = ready && side !== null && stakeBase > 0n;
  const quoteReading = useReadingQuery([...privateKeys.all, "quote", debounced], () => sizePrivateForStake(market.marketId, side!, stakeBase), { enabled: askable && debounced === signature, pollMs: REQUOTE_MS });
  const quote = askable && quoteReading?.ok ? quoteReading.value : null;
  const quoteError = askable && quoteReading && !quoteReading.ok ? quoteReading.error : null;
  const budget = budgetReading?.ok ? budgetReading.value : null;
  const wallet = sheet?.ok ? sheet.value.spendableBase : null;
  const minStake = status.data?.minStakeBase ? BigInt(status.data.minStakeBase) : null;
  const maxStake = status.data?.maxStakeBase ? BigInt(status.data.maxStakeBase) : null;
  const short = budget && stakeBase > budget.balanceBase ? stakeBase - budget.balanceBase : 0n;
  const reallowOnly = budget !== null && short === 0n && stakeBase > budget.allowanceBase;
  const wanted = stakeBase * TOP_UP_STAKES;
  const topUp = short === 0n ? 0n : wallet !== null && wanted > wallet ? wallet : wanted;
  const pending = (claims.data ?? []).find((c) => c.status === "pending") ?? null;
  const busy = actions.busy !== null;

  const blocker = ((): string | null => {
    if (!session.isConnected) return PRIVATE.cta.signIn;
    if (status.isPending) return PRIVATE.cta.probing;
    if (!ready) return PRIVATE.cta.unavailable(status.data?.reasons[0] ?? (status.error instanceof Error ? status.error.message : "unreachable"));
    if (side === null) return PRIVATE.cta.pickSide;
    if (stakeBase === 0n) return PRIVATE.cta.enterAmount;
    if (minStake !== null && stakeBase < minStake) return PRIVATE.cta.belowMin(usd(minStake));
    if (maxStake !== null && stakeBase > maxStake) return PRIVATE.cta.overCap(usd(maxStake));
    if (market.lockAtSec - nowSec < LOCK_GUARD_SEC) return PRIVATE.cta.tooLate;
    if (short > 0n) return PRIVATE.cta.fundFirst(usd(short));
    if (reallowOnly) return PRIVATE.cta.reallowFirst;
    if (quoteError) return PRIVATE.cta.refused(quoteError.technical.split("\n")[0] ?? quoteError.kind);
    if (!quote) return PRIVATE.cta.pricing;
    return null;
  })();

  const fund = () => {
    if (!budget) return;
    const amountBase = reallowOnly ? 0n : topUp;
    void actions.write("fund", { kind: "private-deposit-and-allow", amountBase, allowanceBase: budget.balanceBase + amountBase }, PRIVATE.desk.note);
  };
  const place = async () => {
    if (!quote || !side || !status.data?.contract || blocker) return;
    setResult(null);
    try {
      setResult(await actions.open({ marketId: market.marketId, asset: market.asset, intervalSec: market.intervalSec, expirySec: market.expirySec, side, stakeBase, minQuantityRaw: (quote.quantityRaw * FILL_FLOOR_BPS) / 10_000n, contract: status.data.contract, chainId: status.data.chainId }));
    } catch (error) {
      setResult({ status: "unknown", reason: error instanceof Error ? error.message.split("\n")[0]! : String(error), txs: {} });
    }
  };
  const contracts = (raw: bigint) => formatBaseUnits(raw, USD_DECIMALS, { minDp: 0, maxDp: 2 });
  const sideWord = (s: Side) => (s === "up" ? PRIVATE.up : PRIVATE.down);

  return (
    <div className="pv flex flex-col gap-4">
      <OutcomePills label={PRIVATE.side} value={side} onChange={setSide} outcomes={[{ id: "up", label: PRIVATE.up, price: "" }, { id: "down", label: PRIVATE.down, price: "" }]} />
      <div className="flex flex-col gap-2">
        <span className="type-label-micro text-ink-secondary">{PRIVATE.amount}</span>
        <AmountField value={amountText} onChange={setAmountText} label={PRIVATE.amount} />
        <QuickAdds adds={ADDS} label={PRIVATE.quickAdds} onAdd={(n) => setAmountText(String((Number.parseInt(amountText || "0", 10) || 0) + n))} />
      </div>
      {session.isConnected && budget && (short > 0n || reallowOnly) ? (
        <div className="pv-box">
          <p className="type-caption text-ink">{reallowOnly ? `${PRIVATE.rows.balance} ${usd(budget.balanceBase)} · ${PRIVATE.rows.limit} ${usd(budget.allowanceBase)}` : `${PRIVATE.rows.balance} ${usd(budget.balanceBase)}`}</p>
          <button type="button" className="pv-box-action" disabled={busy || (!reallowOnly && topUp < short)} onClick={fund}>
            {actions.busy === "fund" ? PRIVATE.cta.funding : reallowOnly ? PRIVATE.cta.reallow : PRIVATE.cta.fund(usd(topUp))}
          </button>
        </div>
      ) : null}
      <OrderSummary
        title={PRIVATE.summary}
        rows={[
          { label: PRIVATE.rows.contracts, value: quote ? PRIVATE.rows.contractsValue(contracts(quote.quantityRaw)) : null },
          { label: PRIVATE.rows.price, value: quote ? formatCents(quote.priceRaw) : null },
          { label: PRIVATE.rows.cost, value: quote ? usd(quote.stakeBase) : null },
          { label: PRIVATE.rows.floor, value: quote ? PRIVATE.rows.contractsValue(contracts((quote.quantityRaw * FILL_FLOOR_BPS) / 10_000n)) : null, tone: "muted" },
          { label: PRIVATE.rows.balance, value: budget ? usd(budget.spendableBase) : null, tone: "muted" },
        ]}
        total={{ label: PRIVATE.total, value: quote ? usd(quote.quantityRaw + quote.stakeBase - quote.costBase) : null, tone: "profit" }}
      />
      {pending ? (
        <button type="button" className="min-h-touch w-full rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={busy} onClick={() => void actions.resume(pending.slotId).then((r) => r && setResult(r))}>
          {actions.busy?.startsWith("resume") ? PRIVATE.claims.resuming : PRIVATE.cta.resume}
        </button>
      ) : null}
      <SheetFooter>
        {!session.isConnected ? (
          <button type="button" onClick={() => session.connectFor(PRIVATE.cta.signInFor)} className="min-h-touch w-full rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{PRIVATE.cta.signIn}</button>
        ) : actions.busy === "sign" || actions.busy === "open" ? (
          <button type="button" disabled aria-disabled className="min-h-touch w-full rounded-md bg-surface-2 px-4 type-body-strong text-ink" aria-live="polite">{actions.busy === "sign" ? PRIVATE.cta.signing : PRIVATE.cta.placing}</button>
        ) : blocker ? (
          <button type="button" disabled aria-disabled className="min-h-touch w-full cursor-not-allowed rounded-md border border-hairline bg-surface-2 px-4 type-body-strong text-ink-secondary">{blocker}</button>
        ) : (
          <HoldToConfirm className="w-full" confirmLabel={PRIVATE.cta.placing} onConfirm={() => void place()}>
            {PRIVATE.cta.place(sideWord(side!), usd(stakeBase))}
          </HoldToConfirm>
        )}
      </SheetFooter>
      {result?.status === "opened" ? (
        <div role="status" className="flex flex-col gap-1 rounded-lg bg-cream p-3 text-cream-ink">
          <p className="type-body-strong">{PRIVATE.outcome.placed(sideWord(result.ticket.claim.outcomeIdx === 0 ? "up" : "down"), contracts(BigInt(result.ticket.quantityRaw)), usd(BigInt(result.ticket.claim.stakeBase)))}</p>
          {result.ticket.txs.mint.length > 10 ? <a href={txUrl(result.ticket.txs.mint, webEnv.markets.network)} target="_blank" rel="noreferrer" className="min-h-touch type-caption underline">{PRIVATE.outcome.txs}</a> : null}
        </div>
      ) : result?.status === "refused" ? (
        <div role="alert" className="pv-note pv-note--warn">
          <p className="type-body-strong">{PRIVATE.outcome.notPlaced}</p>
          <p className="type-caption">{result.reason}{BigInt(result.refundedBase) > 0n ? ` ${PRIVATE.outcome.refunded(usd(BigInt(result.refundedBase)))}` : ""}</p>
          <details className="type-caption"><summary className="min-h-touch">Technical details</summary>{result.technical}</details>
        </div>
      ) : result?.status === "unknown" ? (
        <div role="alert" className="pv-note pv-note--warn">
          <p className="type-body-strong">{PRIVATE.outcome.unknown}</p>
          <details className="type-caption"><summary className="min-h-touch">Technical details</summary>{result.reason}</details>
        </div>
      ) : null}
      <p className="type-caption text-ink-secondary">{PRIVATE.always}</p>
      <p className="type-caption text-ink-secondary">{PRIVATE.honesty} {PRIVATE.signatures}</p>
    </div>
  );
}
