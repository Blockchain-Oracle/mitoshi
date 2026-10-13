"use client";
// Ported from Masayume 68f7a09:web/src/features/vault/TradingBalancePanel.tsx, in the grammar of Owarine 90a91d71:web/src/
// features/vault/{TradingBalanceView,VaultControls,VaultCells}.tsx + vault.css (R4-4, D-227): the pocket's own figure
// (the vault's free amount plus every live grant's budget — the same sum as the money card and the tile), one line, one
// pill field with Max, the Add and Withdraw pills below it, one hint, one fee line, the stat tiles, then tap-trading.
// Withdraw stays partial (Mitoshi's fix, E.5 S7): the typed amount, up to Free. Adding is one root transaction
// (`[approve, deposit]`, self-paid); withdrawing is sponsored and paid to the owner only — a blocking receive policy
// refuses and nothing moves (D-112). A confirmed write names itself in a toast with its Receipt (critic gap 21). The
// rows the vault holds are in Your bets now, beside the wallet's and the Boosts'.
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { useBalanceSheet, useVaultBets, useVaultSnapshot } from "@cwf/markets/react";
import { useState } from "react";
import { Masked } from "@/components/kit/Masked";
import { PillButton } from "@/components/kit/PillButton";
import { LoadingState } from "@/components/states";
import { TxFailureCard, useTxLifecycle } from "@/components/tx";
import { notifyReceipt } from "@/features/receipts/write-receipt";
import { AllowancePill } from "@/features/session/AllowancePill";
import { ArmTradingBalance } from "@/features/session/ArmTradingBalance";
import { spentTodayBase } from "@/features/session/caps";
import { useRootSubmitter, useSessionActions, useSessionView } from "@/features/session/context";
import { useNowMs } from "@/lib/clock";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { AmountField, amountProblem } from "./AmountField";
import { LegacyBalance } from "./LegacyBalance";
import { VAULT } from "./copy";
import { grantBudgetsOf, tradingBalanceOf } from "./trading-balance";
import "@/styles/vault.css";
import "@/components/kit/kit.css";

const usd = (base: bigint) => `$${formatBaseUnits(base, 6, { minDp: 2, maxDp: 2 })}`;

function Tile({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="vault-cell-label">{label}</span>
      <div className="vault-cell-value numbers">{value === null ? "—" : <Masked>{value}</Masked>}</div>
    </div>
  );
}

export function TradingBalancePanel() {
  const view = useSessionView();
  const actions = useSessionActions();
  const nowMs = useNowMs();
  const sheet = useBalanceSheet(view.owner);
  const snapshot = useVaultSnapshot(view.owner);
  const bets = useVaultBets(view.owner, view.deployed);
  const root = useRootSubmitter();
  const deposit = useTxLifecycle({ submitter: root });
  const withdraw = useTxLifecycle({ submitter: root });
  const [text, setText] = useState("");
  const [showArm, setShowArm] = useState(false);
  const mask = usePrivacy() ? SHELL.masked : undefined;
  // While the vault reads, the sheet shows its outline (never an empty sheet under its title, R4-4).
  if (view.status === "loading" && view.owner) return <LoadingState shape="ticket" />;
  if (!view.owner || !view.deployed || view.status === "not-passkey" || view.status === "no-wallet") return null;

  const nowSec = Math.floor((nowMs || Date.now()) / 1000);
  const free = view.availableBase;
  const grant = view.grant && !view.grant.revoked ? view.grant : null;
  const snap = snapshot?.ok ? snapshot.value : null;
  const figure = snap ? tradingBalanceOf(snap) : free === null ? null : free + (grant?.budgetBase ?? 0n);
  const wallet = sheet?.ok ? sheet.value.spendableBase : null;
  // The figure counts every live grant's budget (the vault invariant); a strategy's (the copy desk's) is named on its
  // own tile, so Free + the budgets on the tiles always add up to the figure above them.
  const otherBudgets = snap ? grantBudgetsOf(snap) - (grant?.budgetBase ?? 0n) : 0n;
  const openCost = bets?.ok ? bets.value.filter((b) => b.state === "open").reduce((s, b) => s + b.costUpBase + b.costDownBase, 0n) : null;
  const amountBase = parseDecimalToBaseUnits(text.trim(), 6) ?? 0n;
  const inProblem = amountProblem(text, wallet, VAULT.amount.overWallet, mask);
  const outProblem = amountProblem(text, free, VAULT.amount.overBalance, mask);
  // The field turns red only when neither pill can take the amount; otherwise the blocked pill is off and the hint
  // ("Account $A · Free $F") already says why.
  const problem = inProblem && outProblem ? (inProblem === outProblem ? inProblem : VAULT.amount.over) : null;
  const busy = (tx: typeof deposit) => tx.state.kind === "signing" || tx.state.kind === "submitted";
  const anyBusy = busy(deposit) || busy(withdraw);

  const run = async (tx: typeof deposit, kind: "vault-deposit" | "vault-withdraw") => {
    const amount = usd(amountBase);
    const outcome = await tx.run({ kind, amountBase });
    if (outcome?.status !== "confirmed") return;
    setText("");
    notifyReceipt({
      title: kind === "vault-deposit" ? VAULT.toasts.deposited(amount) : VAULT.toasts.withdrawn(amount),
      figure: amount,
      figureLabel: kind === "vault-deposit" ? VAULT.receipt.deposited : VAULT.receipt.withdrawn,
      txHash: outcome.txHash,
      atMs: Date.now(),
      signer: "passkey",
      sponsored: kind === "vault-withdraw",
    });
    await actions.refresh();
  };

  return (
    <section aria-label={VAULT.row.label} className="vault-sheet">
      <LegacyBalance owner={view.owner} />
      <div className="vault-head">
        <p className="vault-figure numbers" aria-live="polite">{figure === null ? "—" : <Masked>{usd(figure)}</Masked>}</p>
        <p className="vault-note">{VAULT.row.note}</p>
      </div>
      <AmountField
        value={text}
        onChange={setText}
        maxBase={wallet}
        label={VAULT.amount.label}
        problem={problem}
        hint={wallet === null || free === null ? "—" : <Masked>{VAULT.amount.hint(usd(wallet), usd(free))}</Masked>}
        disabled={anyBusy}
      />
      <div className="vault-buttons">
        <PillButton tone="accent" size="md" disabled={anyBusy || amountBase === 0n || inProblem !== null} aria-busy={busy(deposit)} onClick={() => void run(deposit, "vault-deposit")}>
          {busy(deposit) ? VAULT.deposit.busy : VAULT.deposit.cta(usd(amountBase))}
        </PillButton>
        <PillButton tone="ink" size="md" disabled={anyBusy || amountBase === 0n || outProblem !== null} aria-busy={busy(withdraw)} onClick={() => void run(withdraw, "vault-withdraw")}>
          {busy(withdraw) ? VAULT.withdraw.busy : VAULT.withdraw.cta(usd(amountBase))}
        </PillButton>
      </div>
      {deposit.state.kind === "failed" ? <TxFailureCard state={deposit.state} onRetry={() => deposit.dispatch({ type: "reset" })} /> : null}
      {withdraw.state.kind === "failed" ? (
        withdraw.state.diagnosis.kind === "receive-policy" ? <p role="alert" className="vault-amount-problem">{VAULT.receivePolicy}</p> : <TxFailureCard state={withdraw.state} onRetry={() => withdraw.dispatch({ type: "reset" })} />
      ) : null}
      <p className="vault-fee">{VAULT.fee}</p>
      <div className="vault-cells">
        <Tile label={VAULT.cells.available} value={free === null ? null : usd(free)} />
        <Tile label={VAULT.cells.inBudget} value={usd(grant?.budgetBase ?? 0n)} />
        {otherBudgets > 0n ? <Tile label={VAULT.cells.inStrategies} value={usd(otherBudgets)} /> : null}
        <Tile label={VAULT.cells.spentToday} value={usd(grant ? spentTodayBase(grant, nowSec) : 0n)} />
        <Tile label={VAULT.cells.open} value={openCost === null ? null : usd(openCost)} />
      </div>
      {grant ? <AllowancePill className="self-start" /> : showArm ? <ArmTradingBalance onDone={() => setShowArm(false)} /> : (
        <PillButton tone="ghost" size="sm" className="self-start" onClick={() => setShowArm(true)}>{VAULT.arm}</PillButton>
      )}
    </section>
  );
}
