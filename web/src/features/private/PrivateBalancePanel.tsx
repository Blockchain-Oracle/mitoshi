"use client";
/**
 * The private balance on Portfolio (S10d) — Ported from Owarine 90a91d71:web/src/features/private/PrivateBalancePanel.tsx
 * (R4-4, D-227), the Trading Balance's grammar: the figure and one line, one pill field, Move in and Withdraw below it,
 * one fee line, four tiles (Balance, Spendable, Desk may spend, Per bet), Revoke, then the trust and visibility words
 * folded under "How private works" (with the desk key the contract pins), then the account's private bets. A deposit
 * allows the desk the whole new balance (the reference's one-transaction fund-and-allocate, self-paid); a withdraw and
 * a revoke are sponsored (D-177). The 1:1 swap ticket it used to wear is gone: a 1:1 move needs no quote.
 */
import { USD_DECIMALS, type Address } from "@cwf/core";
import { formatBaseUnits, parseDecimalToBaseUnits, shortHex } from "@cwf/core/units";
import { useBalanceSheet } from "@cwf/markets/react";
import { useState } from "react";
import { Masked, PillButton } from "@/components/kit";
import { EmptyState, LoadingState } from "@/components/states";
import { AmountField, amountProblem } from "@/features/vault/AmountField";
import { PRIVATE } from "./copy";
import { PrivateClaims } from "./PrivateClaims";
import { usePrivateActions, usePrivateBudget, usePrivateClaims, usePrivateStatus } from "./usePrivate";
import "@/styles/private.css";
import "@/styles/vault.css";

const D = PRIVATE.desk;
const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

function Tile({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="vault-cell-label">{label}</span>
      <div className="vault-cell-value numbers">{value === null ? "—" : <Masked>{value}</Masked>}</div>
    </div>
  );
}

export function PrivateBalancePanel({ wallet }: { wallet: Address }) {
  const status = usePrivateStatus();
  const budgetReading = usePrivateBudget(wallet);
  const claims = usePrivateClaims(wallet);
  const sheet = useBalanceSheet(wallet);
  const actions = usePrivateActions(wallet);
  const [text, setText] = useState("");

  if (status.isPending) return <LoadingState shape="row" />;
  if (!status.data?.contract) return <EmptyState why={D.notDeployed} />;

  const budget = budgetReading?.ok ? budgetReading.value : null;
  const walletBase = sheet?.ok ? sheet.value.spendableBase : null;
  const amountBase = parseDecimalToBaseUnits(text.trim() || "0", USD_DECIMALS) ?? 0n;
  const inProblem = amountProblem(text, walletBase, D.over);
  const outProblem = amountProblem(text, budget?.balanceBase ?? null, D.over);
  const problem = inProblem && outProblem ? inProblem : null;
  const busy = actions.busy !== null;
  const moveIn = () => {
    if (!budget) return;
    const amount = usd(amountBase);
    void actions
      .write("move", { kind: "private-deposit-and-allow", amountBase, allowanceBase: budget.balanceBase + amountBase }, D.toasts.moved(amount), { title: D.toasts.moved(amount), figure: amount, figureLabel: D.receipt.moved, signer: "passkey", sponsored: false })
      .then((ok) => ok && setText(""));
  };
  const withdraw = () => {
    const amount = usd(amountBase);
    void actions
      .write("withdraw", { kind: "private-withdraw", amountBase }, D.toasts.withdrawn(amount), { title: D.toasts.withdrawn(amount), figure: amount, figureLabel: D.receipt.withdrawn, signer: "passkey", sponsored: true })
      .then((ok) => ok && setText(""));
  };

  return (
    <section aria-label={D.title} className="vault-sheet">
      <div className="vault-head">
        <p className="vault-figure numbers">{budget ? <Masked>{usd(budget.balanceBase)}</Masked> : "—"}</p>
        <p className="vault-note">{D.note}</p>
      </div>
      <AmountField
        value={text}
        onChange={setText}
        maxBase={walletBase}
        label={D.amount}
        problem={problem}
        hint={walletBase === null || !budget ? "—" : <Masked>{D.hint(usd(walletBase), usd(budget.balanceBase))}</Masked>}
        disabled={busy}
      />
      <div className="vault-buttons">
        <PillButton tone="accent" size="md" disabled={busy || !budget || amountBase === 0n || inProblem !== null} aria-busy={actions.busy === "move"} onClick={moveIn}>
          {actions.busy === "move" ? D.moving : D.deposit(usd(amountBase))}
        </PillButton>
        <PillButton tone="ink" size="md" disabled={busy || !budget || amountBase === 0n || outProblem !== null} aria-busy={actions.busy === "withdraw"} onClick={withdraw}>
          {actions.busy === "withdraw" ? D.moving : D.withdraw(usd(amountBase))}
        </PillButton>
      </div>
      <p className="vault-fee">{D.fee}</p>
      <div className="vault-cells">
        <Tile label={D.cells.balance} value={budget ? usd(budget.balanceBase) : null} />
        <Tile label={D.cells.spendable} value={budget ? usd(budget.spendableBase) : null} />
        <Tile label={D.cells.allowance} value={budget ? usd(budget.allowanceBase) : null} />
        <Tile label={D.cells.cap} value={status.data.maxStakeBase ? usd(BigInt(status.data.maxStakeBase)) : null} />
      </div>
      {budget && budget.allowanceBase > 0n ? (
        <div className="flex flex-wrap items-center gap-3">
          <PillButton tone="white" size="sm" disabled={busy} onClick={() => void actions.write("revoke", { kind: "private-revoke" }, D.toasts.revoked)}>
            {actions.busy === "revoke" ? D.revoking : D.revoke}
          </PillButton>
          <span className="type-caption text-ink-secondary">{D.revokeNote}</span>
        </div>
      ) : null}
      <details className="vault-more">
        <summary>{D.more}</summary>
        <div>
          <p>{PRIVATE.honesty}</p>
          <p>{D.trust}</p>
          <p>{D.correlation}</p>
          {status.data.desk ? <p className="numbers">{D.deskKey(shortHex(status.data.desk))}</p> : null}
        </div>
      </details>
      <h3 className="type-body-strong text-ink">{PRIVATE.claims.title}</h3>
      <PrivateClaims owner={wallet} rows={claims.data} loading={claims.isPending} status={status.data} actions={actions} />
    </section>
  );
}
