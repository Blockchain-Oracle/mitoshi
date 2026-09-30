"use client";
// Ported from Masayume 68f7a09:web/src/features/session/{SessionModal,CapsEditor,CapabilityReceipt}.tsx — the arm
// flow's first face is the reference's AccountSetup moment: one strong sentence, one button (E.7, kept exactly); the
// caps sit behind "Adjust" as three presets and three lifetimes on the adopted 21st 23552 segmented control (not six
// inputs), and the capability receipt behind "What you are signing". Masayume's bottom-sheet-turned-modal shell is the
// app's centred `Modal` (31359) wherever this is hosted.
/**
 * Arming the Trading Balance (S7; D38a): one passkey confirmation sends ONE root transaction —
 * `[pathUSD.approve(vault, budget), EventVault.depositAndGrant(budget, SESSION → this device's key, caps, expiry,
 * budget)]` — self-paid (capital intake is never sponsored). The key is made here, non-extractable, and never leaves the
 * device. A failure says nothing was taken and changes nothing.
 */
import { useBalanceSheet } from "@cwf/markets/react";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MotionScope } from "@/components/motion-scope";
import { TxCta, useTxLifecycle } from "@/components/tx";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { nowMs as clockNow } from "@/lib/clock";
import { DEFAULT_EXPIRY, DEFAULT_PRESET, expiryOptions, PRESETS, presetOptions, tapsPerDay, termsOf, usd, leftNowBase, type ExpiryId, type PresetId } from "./caps";
import { SESSION } from "./copy";
import { useSessionActions, useSessionView } from "./context";

const hoursText = (id: ExpiryId) => SESSION.expiries[id];
const until = (sec: number) => new Date(sec * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export function ArmTradingBalance({ onDone }: { onDone?: () => void }) {
  const view = useSessionView();
  const actions = useSessionActions();
  const tx = useTxLifecycle();
  const sheet = useBalanceSheet(view.owner);
  const [preset, setPreset] = useState<PresetId>(DEFAULT_PRESET);
  const [expiry, setExpiry] = useState<ExpiryId>(DEFAULT_EXPIRY);
  const [problem, setProblem] = useState<string | null>(null);
  if (view.status === "no-wallet" || view.status === "not-passkey" || view.status === "not-deployed") return null;

  if (view.status === "armed" && view.grant) {
    const left = leftNowBase(view.grant, Math.floor(clockNow() / 1000));
    return (
      <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 p-3" role="status">
        <p className="flex items-center gap-2 type-body-strong text-ink"><Check aria-hidden className="size-4 text-accent" />{SESSION.armed}</p>
        <p className="type-caption text-ink-secondary">{SESSION.armedBody(usd(left), until(view.grant.expiresAtSec))}</p>
        <Link href="/settings/account" className="min-h-touch self-start py-2 type-caption text-ink underline">{SESSION.manager.title}</Link>
      </div>
    );
  }

  const p = PRESETS[preset];
  const budget = usd(p.budgetBase);
  const spendable = sheet?.ok ? sheet.value.spendableBase : null;
  const short = spendable !== null && spendable < p.budgetBase;
  const arm = async () => {
    setProblem(null);
    const key = await actions.ensureKey();
    if (!key) return setProblem(SESSION.noStorage);
    const { amountBase, terms } = termsOf(p, expiry, key, Math.floor(clockNow() / 1000));
    const outcome = await tx.run({ kind: "vault-deposit-and-grant", amountBase, terms });
    if (!outcome) return setProblem(SESSION.failed);
    if (outcome.status === "confirmed") {
      await actions.refresh();
      onDone?.();
      return;
    }
    if (outcome.status === "refused") setProblem(outcome.diagnosis.kind === "user-rejected" ? SESSION.aborted : SESSION.failed);
  };
  const state = short && spendable !== null ? { kind: "blocked" as const, reason: SESSION.walletShort(usd(spendable)) } : tx.state.kind === "failed" || tx.state.kind === "confirmed" ? { kind: "idle" as const } : tx.state;

  return (
    <section aria-labelledby="arm-trading-balance" className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-2 p-3">
      <p className="type-label-micro text-ink-secondary">{SESSION.eyebrow}</p>
      <h3 id="arm-trading-balance" className="type-body-strong text-ink">{SESSION.lead(budget)}</h3>
      <p className="type-caption text-ink-secondary">{SESSION.facts(usd(p.perTapBase), usd(p.dailyBase), hoursText(expiry))}</p>
      <p className="type-caption text-ink-secondary">{SESSION.fees}</p>
      {problem ? <p role="alert" className="type-caption text-ink">{problem}</p> : null}
      <TxCta state={state} action={problem ? SESSION.retry : SESSION.cta(budget)} signer="passkey" onConfirm={() => void arm()} />
      <p className="type-caption text-ink-secondary">{SESSION.skip}</p>
      <details className="modal-disclosure">
        <summary className="min-h-touch py-2 type-caption text-ink">{SESSION.adjust(usd(p.perTapBase), usd(p.dailyBase), hoursText(expiry))}</summary>
        <MotionScope>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1">
              <span className="type-label-micro text-ink-secondary">{SESSION.presetLabel}</span>
              <SegmentedControl label={SESSION.presetLabel} value={preset} onValueChange={setPreset} options={presetOptions} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="type-label-micro text-ink-secondary">{SESSION.expiryLabel}</span>
              <SegmentedControl label={SESSION.expiryLabel} value={expiry} onValueChange={setExpiry} options={expiryOptions} />
            </div>
            <p className="type-caption text-ink-secondary">{SESSION.example(usd(p.perTapBase), tapsPerDay(p), usd(p.dailyBase))}</p>
            <p className="type-caption text-ink-muted">{SESSION.resets}</p>
          </div>
        </MotionScope>
      </details>
      <details className="modal-disclosure">
        <summary className="min-h-touch py-2 type-caption text-ink">{SESSION.receiptTitle}</summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-2 type-caption">
          <dt className="text-ink-secondary">{SESSION.receipt.scope}</dt>
          <dd className="text-ink">{SESSION.receipt.scopeValue}</dd>
          <dt className="text-ink-secondary">{SESSION.receipt.never}</dt>
          <dd className="text-ink">{SESSION.receipt.neverValue}</dd>
          <dt className="text-ink-secondary">{SESSION.receipt.priceCap}</dt>
          <dd className="numbers text-ink">{SESSION.receipt.priceCapValue(p.priceCents)}</dd>
          <dt className="text-ink-secondary">{SESSION.receipt.positions}</dt>
          <dd className="numbers text-ink">{p.positions}</dd>
          <dt className="text-ink-secondary">{SESSION.receipt.key}</dt>
          <dd className="text-ink">{SESSION.receipt.keyValue}</dd>
          <dt className="text-ink-secondary">{SESSION.receipt.fees}</dt>
          <dd className="text-ink">{SESSION.receipt.feesValue}</dd>
          <dt className="text-ink-secondary">{SESSION.receipt.signatures}</dt>
          <dd className="text-ink">{SESSION.receipt.signaturesValue}</dd>
        </dl>
      </details>
    </section>
  );
}

