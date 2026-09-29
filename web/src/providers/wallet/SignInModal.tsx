"use client";

// The one sign-in modal (plan C.3.1; D-046). Layout from 21st.dev 19045 felipemenezes098/sign-in-4 (the passkey badge,
// one sentence, one primary action, the phishing-resistant footnote) with 20041's step flow (choose → a named wait →
// done or a retry) but NO bottom drawer — a centred modal on every screen (owner rule), and the wallet list laid out
// from 21st.dev 8588 ravikatiyar162/connect-wallet-modal. Loaded on first open (lazy island).
import { diagnose } from "@cwf/markets/errors";
import { ChevronRight, Fingerprint, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { useId, useState } from "react";
import type { Connector } from "wagmi";
import { Modal } from "@/components/ui/modal";
import { diagnosisCopy } from "@/lib/copy";
import { SIGN_IN } from "./copy";
import { useWalletChoices, type ConnectOutcome } from "./useWalletChoices";
import { SIDE_CHAINS, WALLETCONNECT_ENABLED } from "./wagmi-config";
import { useWalletShell } from "./wallet-shell-context";
import { Onboarding, ONBOARD } from "@/features/onboarding";

type Step = { kind: "choose" } | { kind: "waiting"; label: string } | { kind: "failed"; headline: string; body: string; technical: string; retry: () => void } | { kind: "onboard" };

export interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SignInModal({ open, onOpenChange }: SignInModalProps) {
  const shell = useWalletShell();
  const choices = useWalletChoices();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [name, setName] = useState("");
  const nameId = useId();
  const robinhood = shell.pickerMode === "robinhood";

  // `created`: a new passkey account continues into the rest of the ceremony (fund → arm → /markets) in this modal.
  async function run(label: string, attempt: () => Promise<ConnectOutcome>, created = false) {
    setStep({ kind: "waiting", label });
    const result = await attempt();
    if (result.ok) {
      if (created) return setStep({ kind: "onboard" });
      setStep({ kind: "choose" });
      onOpenChange(false);
      return;
    }
    if (result.aborted) {
      setStep({ kind: "choose" });
      return;
    }
    const diagnosis = diagnose(result.error);
    const copy = diagnosisCopy(diagnosis.kind);
    setStep({ kind: "failed", headline: copy.headline, body: copy.body, technical: diagnosis.technical, retry: () => void run(label, attempt, created) });
  }

  const walletRow = (connector: Connector, note: string, chainId?: number) => (
    <li key={connector.uid}>
      <button type="button" onClick={() => void run(SIGN_IN.waiting.wallet(connector.name), () => choices.connect(connector, chainId))} className="group flex min-h-touch w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-2">
        {connector.icon ? <img src={connector.icon} alt="" className="size-8 rounded-md" /> : <span aria-hidden className="grid size-8 place-items-center rounded-md border border-hairline text-ink-secondary"><Wallet className="size-4" /></span>}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-body-strong text-ink">{connector.name}</span>
          <span className="type-caption text-ink-secondary">{note}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 text-ink-secondary" />
      </button>
    </li>
  );

  const busy = step.kind === "waiting";
  if (step.kind === "onboard") {
    return (
      <Modal open={open} onOpenChange={onOpenChange} eyebrow={ONBOARD.eyebrow} title={ONBOARD.created}>
        <Onboarding onClose={() => onOpenChange(false)} />
      </Modal>
    );
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} dismissible={!busy} eyebrow={SIGN_IN.eyebrow} title={robinhood ? SIGN_IN.robinhood.title : SIGN_IN.title} description={robinhood ? SIGN_IN.robinhood.body : SIGN_IN.body}>
      {step.kind === "waiting" ? (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 aria-hidden className="size-6 animate-spin text-ink-secondary motion-reduce:animate-none" />
          <p className="type-body-strong text-ink">{step.label}</p>
        </div>
      ) : step.kind === "failed" ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="type-body-strong text-ink">{step.headline}</p>
          <p className="type-body text-ink-secondary">{step.body}</p>
          <p className="type-body-strong text-ink">Nothing was taken.</p>
          {/* The raw reason, behind a disclosure like every failure card (§2.5): what support needs, never the headline. */}
          <details className="type-caption text-ink-secondary">
            <summary className="min-h-touch cursor-pointer py-2">{SIGN_IN.technical}</summary>
            <p className="numbers break-words">{step.technical}</p>
          </details>
          <div className="flex gap-2">
            <button type="button" onClick={step.retry} className="min-h-touch rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{SIGN_IN.retry}</button>
            <button type="button" onClick={() => setStep({ kind: "choose" })} className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink">{SIGN_IN.back}</button>
          </div>
        </div>
      ) : robinhood ? (
        <ul className="flex flex-col gap-1">
          {choices.injected.map((c) => walletRow(c, SIGN_IN.injectedNote, SIDE_CHAINS[0]!.id))}
          {choices.walletConnect ? walletRow(choices.walletConnect, SIGN_IN.walletConnect.note, SIDE_CHAINS[0]!.id) : null}
          {choices.injected.length === 0 && !choices.walletConnect ? <li className="type-caption text-ink-secondary">{SIGN_IN.robinhood.none}</li> : null}
        </ul>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2">
            <span aria-hidden className="grid size-14 place-items-center rounded-lg border border-hairline bg-surface-2 text-accent"><Fingerprint className="size-7" /></span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="type-caption text-ink-secondary">{SIGN_IN.nameLabel}</label>
            <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder={SIGN_IN.namePlaceholder} autoComplete="username webauthn" maxLength={48} className="h-12 rounded-md border border-hairline bg-ground px-3 text-ink placeholder:text-ink-muted" />
          </div>
          <button type="button" disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.createPasskey(name), true)} className="inline-flex h-(--ticket-cta-height) items-center justify-center gap-2 rounded-md bg-accent-fill px-5 type-body-strong text-on-accent">
            <Fingerprint aria-hidden className="size-4" />
            {SIGN_IN.create}
          </button>
          <button type="button" disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.signInPasskey())} className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink">
            {SIGN_IN.signIn}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-center type-caption text-ink-secondary"><ShieldCheck aria-hidden className="size-3.5" />{SIGN_IN.footer}</p>
          <div className="flex items-center gap-3 type-label-micro text-ink-secondary" role="separator"><span className="h-px flex-1 bg-hairline" />{SIGN_IN.orWallet}<span className="h-px flex-1 bg-hairline" /></div>
          <ul className="flex flex-col gap-1">
            {choices.tempoWallet ? walletRow(choices.tempoWallet, SIGN_IN.tempoWallet.note) : null}
            {choices.injected.map((c) => walletRow(c, SIGN_IN.injectedNote))}
            {choices.injected.length === 0 ? <li className="px-3 type-caption text-ink-secondary">{SIGN_IN.noInjected}</li> : null}
            {choices.walletConnect ? walletRow(choices.walletConnect, SIGN_IN.walletConnect.note) : !WALLETCONNECT_ENABLED ? <li className="px-3 type-caption text-ink-secondary">{SIGN_IN.walletConnect.missing}</li> : null}
          </ul>
        </>
      )}
    </Modal>
  );
}
