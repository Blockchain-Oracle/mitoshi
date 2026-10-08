"use client";
/**
 * The private desk on Portfolio (S10d; plan 10d "desk from the 27122 swap-ticket layout"; Ported in role from Masayume
 * 68f7a09:web/src/features/private/PrivateBalancePanel.tsx): money moves between the wallet and the private balance on
 * the 27122 `SwapTicket` — pay from one, receive in the other, the flip switches direction, 1:1 so the minimum
 * received is the amount — then the desk's cells (balance, what the desk may spend, spendable, the pinned key, the per-bet
 * cap), Revoke, the honest trust lines, and the account's private bets. A deposit allows the desk the whole new
 * balance (the reference's one-transaction fund-and-allocate); a withdraw and a revoke are sponsored (D-177).
 */
import { USD_DECIMALS, type Address } from "@cwf/core";
import { parseDecimalToBaseUnits, shortHex } from "@cwf/core/units";
import { useBalanceSheet } from "@cwf/markets/react";
import { useState } from "react";
import SectionHead from "@/components/shell/SectionHead";
import { EmptyState, LoadingState } from "@/components/states";
import { SwapTicket, type SwapAsset } from "@/components/ui/swap-ticket";
import { useNowMs } from "@/lib/clock";
import { usd } from "../parlay/format";
import { PRIVATE } from "./copy";
import { PrivateClaims } from "./PrivateClaims";
import { usePrivateActions, usePrivateBudget, usePrivateClaims, usePrivateStatus } from "./usePrivate";
import "@/styles/private.css";

const D = PRIVATE.desk;

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="pv-cell-label">{label}</span>
      <div className="pv-cell-value">{value}</div>
    </div>
  );
}

export function PrivateDesk({ wallet, index }: { wallet: Address; index: string }) {
  const nowMs = useNowMs();
  const status = usePrivateStatus();
  const budgetReading = usePrivateBudget(wallet);
  const claims = usePrivateClaims(wallet);
  const sheet = useBalanceSheet(wallet);
  const actions = usePrivateActions(wallet);
  const [direction, setDirection] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("5");

  const budget = budgetReading?.ok ? budgetReading.value : null;
  const walletBase = sheet?.ok ? sheet.value.spendableBase : null;
  const assets: SwapAsset[] = [
    { symbol: D.wallet, name: D.walletName, decimals: USD_DECIMALS, balanceBase: walletBase },
    { symbol: D.private, name: D.privateName, decimals: USD_DECIMALS, balanceBase: budget?.balanceBase ?? null },
  ];
  const [pay, receive] = direction === "deposit" ? [assets[0]!, assets[1]!] : [assets[1]!, assets[0]!];
  const amountBase = parseDecimalToBaseUnits(amount || "0", USD_DECIMALS) ?? 0n;
  const blocker = amountBase === 0n ? D.enter : pay.balanceBase !== null && amountBase > pay.balanceBase ? D.over : budget === null ? PRIVATE.cta.probing : null;
  const submit = () => {
    if (blocker || !budget) return;
    if (direction === "deposit") void actions.write("move", { kind: "private-deposit-and-allow", amountBase, allowanceBase: budget.balanceBase + amountBase }, D.note);
    else void actions.write("move", { kind: "private-withdraw", amountBase }, D.withdraw(usd(amountBase)));
  };

  return (
    <section aria-label={D.title} className="pv-desk">
      <SectionHead number={index} title={D.title} />
      {status.isPending ? (
        <LoadingState shape="row" />
      ) : !status.data?.contract ? (
        <EmptyState why={D.notDeployed} />
      ) : (
        <>
          <p className="type-caption text-ink-secondary">{D.note}</p>
          <SwapTicket
            assets={assets}
            pay={pay}
            receive={receive}
            amount={amount}
            onAmountChange={setAmount}
            onPick={(side, asset) => setDirection((side === "pay") === (asset.symbol === D.wallet) ? "deposit" : "withdraw")}
            onFlip={() => setDirection((d) => (d === "deposit" ? "withdraw" : "deposit"))}
            quote={amountBase > 0n ? { receiveBase: amountBase, minReceiveBase: amountBase, guardBandBps: 0, quotedAtMs: budgetReading?.ok ? budgetReading.asOfMs : nowMs } : null}
            nowMs={nowMs}
            blocker={blocker}
            ctaLabel={direction === "deposit" ? D.deposit(usd(amountBase)) : D.withdraw(usd(amountBase))}
            onSubmit={submit}
            pending={actions.busy === "move"}
            className="max-w-none"
          />
          <p className="type-caption text-ink-secondary">{D.firstTime}</p>
          <div className="pv-cells">
            <Cell label={D.cells.balance} value={budget ? usd(budget.balanceBase) : "—"} />
            <Cell label={D.cells.allowance} value={budget ? usd(budget.allowanceBase) : "—"} />
            <Cell label={D.cells.spendable} value={budget ? usd(budget.spendableBase) : "—"} />
            <Cell label={D.cells.desk} value={status.data.desk ? shortHex(status.data.desk) : "—"} />
            <Cell label={D.cells.cap} value={status.data.maxStakeBase ? usd(BigInt(status.data.maxStakeBase)) : "—"} />
          </div>
          {budget && budget.allowanceBase > 0n ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink" disabled={actions.busy !== null} onClick={() => void actions.write("revoke", { kind: "private-revoke" }, D.revokeNote)}>
                {actions.busy === "revoke" ? D.revoking : D.revoke}
              </button>
              <span className="type-caption text-ink-secondary">{D.revokeNote}</span>
            </div>
          ) : null}
          <p className="type-caption text-ink-secondary">{PRIVATE.honesty} {D.trust}</p>
          <p className="type-caption text-ink-secondary">{D.correlation}</p>
          <h3 className="type-body-strong text-ink">{PRIVATE.claims.title}</h3>
          <p className="type-caption text-ink-secondary">{PRIVATE.claims.sub}</p>
          <PrivateClaims owner={wallet} rows={claims.data} loading={claims.isPending} status={status.data} actions={actions} />
        </>
      )}
    </section>
  );
}
