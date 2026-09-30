"use client";
// Ported from Masayume 68f7a09:web/src/features/vault/{TradingBalancePanel,TradingBalanceView,VaultControls,VaultCells,
// VaultBetRows}.tsx — the pool row under the plate (label · what the pool is FOR · amount), the snapshot cells, deposit
// and withdraw, and the rows the vault holds. Fixed while porting (E.5 S7): withdraw is partial with a Max and an inline
// reason (Agari's `AmountField`) instead of "withdraw everything"; the tap-trading allowance is the persistent pill.
/**
 * The Trading Balance on Portfolio (S7): what is free, what sits in the tap-trading budget and what it spent today,
 * add money (one root transaction, `[approve, deposit]`, self-paid) and withdraw any part of the free amount (sponsored,
 * paid to the owner only — a blocking receive policy refuses and nothing moves, D-112). Below it, the Windows it
 * traded: open, settling into the balance, paid into it.
 */
import { parseDecimalToBaseUnits } from "@cwf/core/units";
import { useBalanceSheet, useVaultBets } from "@cwf/markets/react";
import { useState } from "react";
import { TxCta, TxFailureCard, useTxLifecycle } from "@/components/tx";
import { AllowancePill } from "@/features/session/AllowancePill";
import { ArmTradingBalance } from "@/features/session/ArmTradingBalance";
import { spentTodayBase, usd } from "@/features/session/caps";
import { useSessionActions, useSessionView } from "@/features/session/context";
import { useNowMs } from "@/lib/clock";
import { notify } from "@/lib/toast";
import { AmountField, amountProblem } from "./AmountField";
import { VAULT } from "./copy";
import { VaultBetRows } from "./VaultBetRows";

const cell = (label: string, value: string) => (
  <div className="flex min-w-0 flex-col">
    <span className="type-label-micro text-ink-secondary">{label}</span>
    <span className="numbers type-body-strong text-ink">{value}</span>
  </div>
);

export function TradingBalancePanel() {
  const view = useSessionView();
  const actions = useSessionActions();
  const nowMs = useNowMs();
  const sheet = useBalanceSheet(view.owner);
  const bets = useVaultBets(view.owner, view.deployed);
  const deposit = useTxLifecycle();
  const withdraw = useTxLifecycle();
  const [inText, setIn] = useState("");
  const [outText, setOut] = useState("");
  const [showArm, setShowArm] = useState(false);
  if (!view.owner || !view.deployed || view.status === "not-passkey" || view.status === "no-wallet") return null;

  const nowSec = Math.floor((nowMs || Date.now()) / 1000);
  const free = view.availableBase;
  const grant = view.grant && !view.grant.revoked ? view.grant : null;
  const inBudget = grant?.budgetBase ?? 0n;
  const wallet = sheet?.ok ? sheet.value.spendableBase : null;
  const inBase = parseDecimalToBaseUnits(inText.trim(), 6) ?? 0n;
  const outBase = parseDecimalToBaseUnits(outText.trim(), 6) ?? 0n;
  const inProblem = amountProblem(inText, wallet, VAULT.amount.overWallet);
  const outProblem = amountProblem(outText, free, VAULT.amount.overBalance);

  const runDeposit = async () => {
    const outcome = await deposit.run({ kind: "vault-deposit", amountBase: inBase });
    if (outcome?.status === "confirmed") {
      setIn("");
      notify.neutral(VAULT.toasts.deposited);
      await actions.refresh();
    }
  };
  const runWithdraw = async () => {
    const outcome = await withdraw.run({ kind: "vault-withdraw", amountBase: outBase });
    if (outcome?.status === "confirmed") {
      setOut("");
      notify.neutral(VAULT.toasts.withdrawn);
      await actions.refresh();
    }
  };
  const idleOr = (tx: typeof deposit, blockedReason: string | null) =>
    blockedReason ? { kind: "blocked" as const, reason: blockedReason } : tx.state.kind === "confirmed" ? { kind: "idle" as const } : tx.state;

  return (
    <section aria-labelledby="tb-title" className="pool-rows flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="tb-title" className="pool-label">{VAULT.row.label}</h2>
          <p className="pool-note">{VAULT.row.note}</p>
        </div>
        <div className="pool-amount numbers" aria-live="polite">{free === null ? "—" : usd(free + inBudget)}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cell(VAULT.cells.available, free === null ? "—" : usd(free))}
        {cell(VAULT.cells.inBudget, usd(inBudget))}
        {grant ? cell(VAULT.cells.spentToday, usd(spentTodayBase(grant, nowSec))) : null}
      </div>
      {grant ? <AllowancePill /> : showArm ? <ArmTradingBalance onDone={() => setShowArm(false)} /> : (
        <button type="button" onClick={() => setShowArm(true)} className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink">{VAULT.arm}</button>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <AmountField value={inText} onChange={setIn} maxBase={wallet} label={VAULT.deposit.label} over={VAULT.amount.overWallet} hint={VAULT.amount.walletHolds} disabled={deposit.state.kind === "signing" || deposit.state.kind === "submitted"} />
          <TxCta state={idleOr(deposit, inProblem ?? (inBase === 0n ? VAULT.amount.zero : null))} action={VAULT.deposit.cta(usd(inBase))} signer="passkey" onConfirm={() => void runDeposit()} />
          <p className="type-caption text-ink-muted">{VAULT.deposit.note}</p>
          {deposit.state.kind === "failed" ? <TxFailureCard state={deposit.state} onRetry={() => deposit.dispatch({ type: "reset" })} /> : null}
        </div>
        <div className="flex flex-col gap-2">
          <AmountField value={outText} onChange={setOut} maxBase={free} label={VAULT.withdraw.label} over={VAULT.amount.overBalance} hint={VAULT.amount.balanceHolds} disabled={withdraw.state.kind === "signing" || withdraw.state.kind === "submitted"} />
          <TxCta state={idleOr(withdraw, outProblem ?? (outBase === 0n ? VAULT.amount.zero : null))} action={VAULT.withdraw.cta(usd(outBase))} signer="passkey" sponsored onConfirm={() => void runWithdraw()} />
          <p className="type-caption text-ink-muted">{VAULT.withdraw.note}</p>
          {withdraw.state.kind === "failed" ? (
            withdraw.state.diagnosis.kind === "receive-policy" ? <p role="alert" className="type-caption text-ink">{VAULT.receivePolicy}</p> : <TxFailureCard state={withdraw.state} onRetry={() => withdraw.dispatch({ type: "reset" })} />
          ) : null}
        </div>
      </div>
      <p className="type-caption text-ink-secondary">{VAULT.settledNote}</p>
      <VaultBetRows bets={bets} nowSec={nowSec} />
    </section>
  );
}
