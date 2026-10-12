"use client";

// The one sign-in modal (plan C.3.1; D-046), in Owarine 90a91d71's compact picker (`WalletPicker`, RainbowKit 2.2.11's
// compact connect modal as Masayume shipped it — O-9, D-222): a title, grouped rows — passkey first, then wallets —
// and "New to passkeys? Learn more". A choice moves to a step with Back: the passkey's optional name before it is
// made, a named wait, or a failure with its retry; a new account continues into onboarding. Below 768 px the panel is
// the mobile bottom sheet (D-222). Loaded on first open (lazy island).
import { Dialog } from "@base-ui/react/dialog";
import { diagnose } from "@cwf/markets/errors";
import { Fingerprint, KeyRound, Wallet } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { Connector } from "wagmi";
import { Modal } from "@/components/ui/modal";
import { diagnosisCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { ACCOUNT, SIGN_IN, WALLET_MODAL as T } from "./copy";
import { useWalletChoices, type ConnectOutcome } from "./useWalletChoices";
import { SIDE_CHAINS } from "./wagmi-config";
import { ActionButton, BackButton, CloseButton, Spinner, WalletDialog, WalletIcon } from "./wallet-modal-parts";
import { useWalletShell } from "./wallet-shell-context";
import { Onboarding, ONBOARD } from "@/features/onboarding";

type Step =
  | { kind: "choose" }
  | { kind: "learn" }
  | { kind: "create" }
  | { kind: "waiting"; label: string }
  | { kind: "failed"; headline: string; body: string; technical: string; retry: () => void }
  | { kind: "onboard" };

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

  const connectRow = (connector: Connector, chainId?: number) => (
    <Row
      key={connector.uid}
      icon={connector.icon ? <WalletIcon src={connector.icon} size={28} /> : <GlyphIcon><Wallet className="size-4" /></GlyphIcon>}
      name={connector.name}
      onClick={() => void run(SIGN_IN.waiting.wallet(connector.name), () => choices.connect(connector, chainId))}
    />
  );

  if (step.kind === "onboard") {
    return (
      <Modal open={open} onOpenChange={onOpenChange} eyebrow={ONBOARD.eyebrow} title={ONBOARD.created}>
        <Onboarding onClose={() => onOpenChange(false)} />
      </Modal>
    );
  }

  const busy = step.kind === "waiting";
  const close = (next: boolean) => {
    if (busy && !next) return;
    if (!next) setStep({ kind: "choose" });
    onOpenChange(next);
  };

  return (
    <WalletDialog open={open} onOpenChange={close} compact>
      <div className="wm-options">
        {step.kind === "choose" ? (
          <div className="wm-list-col">
            <div className="wm-list-head">
              <div className="wm-list-head-spacer" />
              <div className="wm-list-title">
                <Dialog.Title render={<h1 />} className="wm-t18">
                  {robinhood ? SIGN_IN.robinhood.title : SIGN_IN.title}
                </Dialog.Title>
              </div>
              <div className="wm-list-close">
                <CloseButton />
              </div>
            </div>
            <div className="wm-scroll">
              {robinhood ? (
                <>
                  <p className="wm-t14m px-1.5 pt-2">{SIGN_IN.robinhood.body}</p>
                  <Group name={T.groups.wallets}>
                    {choices.injected.map((c) => connectRow(c, SIDE_CHAINS[0]!.id))}
                    {choices.walletConnect ? connectRow(choices.walletConnect, SIDE_CHAINS[0]!.id) : null}
                    {choices.injected.length === 0 && !choices.walletConnect ? <p className="wm-t14m px-1.5">{SIGN_IN.robinhood.none}</p> : null}
                  </Group>
                </>
              ) : (
                <>
                  <Group name={T.groups.passkey(ACCOUNT.network[shell.network])} accent>
                    <Row icon={<GlyphIcon accent><Fingerprint className="size-4" /></GlyphIcon>} name={T.rows.create} note={T.rows.createNote} disabled={!choices.passkey} onClick={() => setStep({ kind: "create" })} />
                    <Row icon={<GlyphIcon><KeyRound className="size-4" /></GlyphIcon>} name={T.rows.signIn} note={T.rows.signInNote} disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.signInPasskey())} />
                  </Group>
                  <Group name={T.groups.wallets}>
                    {choices.tempoWallet ? connectRow(choices.tempoWallet) : null}
                    {choices.injected.map((c) => connectRow(c))}
                    {choices.walletConnect ? connectRow(choices.walletConnect) : null}
                    {!choices.tempoWallet && choices.injected.length === 0 && !choices.walletConnect ? <p className="wm-t14m px-1.5">{SIGN_IN.noInjected}</p> : null}
                  </Group>
                </>
              )}
            </div>
            <div className="wm-divider" />
            <div className="wm-foot">
              <div className="wm-foot-text">
                <span className="wm-t14m">{T.newTo}</span>
              </div>
              <button type="button" className="wm-link wm-touch wm-grow wm-shrink wm-t14b wm-accent" onClick={() => setStep({ kind: "learn" })}>
                {T.learnMore}
              </button>
            </div>
          </div>
        ) : (
          <div className="wm-step">
            <div className="wm-step-head">
              <div className="wm-step-head-side">{busy ? null : <BackButton onClick={() => setStep({ kind: "choose" })} />}</div>
              <div className="wm-step-title">
                <Dialog.Title className="wm-t18">{step.kind === "learn" ? T.intro.title : step.kind === "create" ? T.create.title : SIGN_IN.title}</Dialog.Title>
              </div>
              {busy ? <div className="wm-step-head-side" /> : <CloseButton />}
            </div>
            <div className="wm-step-body">
              <div className="wm-step-inner">
                {step.kind === "learn" ? (
                  <div className="wm-intro">
                    <div className="wm-intro-top" />
                    <div className="wm-intro-features">
                      <Feature art="/wallet/assets.svg" title={T.intro.assetsTitle} body={T.intro.assetsBody} />
                      <Feature art="/wallet/login.svg" title={T.intro.loginTitle} body={T.intro.loginBody} />
                    </div>
                    <div className="wm-intro-actions">
                      <ActionButton label={T.intro.get} onClick={() => setStep({ kind: "create" })} />
                    </div>
                  </div>
                ) : step.kind === "create" ? (
                  <div className="flex flex-col gap-4 px-1 pt-4">
                    <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-lg border border-hairline bg-surface-2 text-accent">
                      <Fingerprint className="size-7" />
                    </span>
                    <p className="text-center type-body text-ink-secondary">{SIGN_IN.body}</p>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={nameId} className="type-caption text-ink-secondary">{SIGN_IN.nameLabel}</label>
                      <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder={SIGN_IN.namePlaceholder} autoComplete="username webauthn" maxLength={48} className="h-12 rounded-md border border-hairline bg-ground px-3 text-ink placeholder:text-ink-muted" />
                    </div>
                    <button type="button" disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.createPasskey(name), true)} className="inline-flex h-(--ticket-cta-height) items-center justify-center gap-2 rounded-md bg-accent-fill px-5 type-body-strong text-on-accent">
                      <Fingerprint aria-hidden className="size-4" />
                      {T.create.cta}
                    </button>
                    <p className="text-center type-caption text-ink-secondary">{SIGN_IN.footer}</p>
                  </div>
                ) : step.kind === "waiting" ? (
                  <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                    <Spinner />
                    <p className="wm-t14b">{step.label}</p>
                  </div>
                ) : (
                  <div role="alert" className="flex flex-col gap-3 px-1 pt-4">
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
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </WalletDialog>
  );
}

function Group({ name, accent = false, children }: { name: string; accent?: boolean; children: ReactNode }) {
  return (
    <>
      <div className="wm-group">
        <span className={cn("wm-t14b", accent ? "wm-accent" : "wm-group-muted")}>{name}</span>
      </div>
      <div className="wm-rows">{children}</div>
    </>
  );
}

/** One row of the list (Owarine `WalletRow`): the icon, the name, a quiet line under it. */
function Row({ icon, name, note, disabled = false, onClick }: { icon: ReactNode; name: string; note?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} className="wm-row wm-touch wm-shrink disabled:opacity-50" onClick={onClick}>
      <span className="wm-row-inner">
        {icon}
        <span className="min-w-0">
          <span className="wm-row-name">{name}</span>
          {note ? <span className="wm-row-note">{note}</span> : null}
        </span>
      </span>
    </button>
  );
}

/** A 28 px tile for a row with no connector artwork: the passkey (accent) or a generic wallet. */
function GlyphIcon({ accent = false, children }: { accent?: boolean; children: ReactNode }) {
  return <span aria-hidden className={cn("wm-icon wm-icon--28 wm-glyph-icon", accent && "is-accent")}>{children}</span>;
}

function Feature({ art, title, body }: { art: string; title: string; body: string }) {
  return (
    <div className="wm-feature">
      <div className="wm-feature-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} alt="" draggable={false} />
      </div>
      <div className="wm-feature-text">
        <span className="wm-t14b">{title}</span>
        <span className="wm-t14m">{body}</span>
      </div>
    </div>
  );
}
