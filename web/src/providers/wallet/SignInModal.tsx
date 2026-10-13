"use client";

// The one sign-in modal (plan C.3.1; D-046), in Owarine 90a91d71's compact picker (`WalletPicker`, RainbowKit 2.2.11's
// compact connect modal as Masayume shipped it — O-9, D-222/D-223): a title, grouped rows — passkey first, then wallets
// — and "New to passkeys? Learn more". One frame (D-224, Owarine's seat): "Create account" goes straight to the passkey
// prompt and the modal closes on it; the server funds the new account from the shell (`FirstFund`) and the welcome card
// says so. A choice shows a named wait or a failure with its retry. Below 768 px the panel is the bottom sheet (D-222);
// R4-8 (D-227): there it holds Owarine's phone picker (`SignInPhone`: the passkey actions large in the thumb zone, the
// wallets as app tiles), the named wait on the tile itself; the failed and learn steps are shared.
// Loaded on first open (lazy island).
import { Dialog } from "@base-ui/react/dialog";
import { diagnose } from "@cwf/markets/errors";
import { Fingerprint, KeyRound, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Connector } from "wagmi";
import { ACCOUNT_CREATED_EVENT } from "@/features/funding";
import { diagnosisCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { ACCOUNT, SIGN_IN, WALLET_MODAL as T } from "./copy";
import { useWalletChoices, type ConnectOutcome } from "./useWalletChoices";
import { passkeyFailure } from "./passkey-errors";
import { SignInPhone, SignInPhoneFailure } from "./SignInPhone";
import { ActionButton, BackButton, CloseButton, Spinner, usePhoneLayout, WalletDialog, WalletIcon } from "./wallet-modal-parts";
import { useWalletShell } from "./wallet-shell-context";

type Step =
  | { kind: "choose"; hint?: string }
  | { kind: "learn" }
  | { kind: "waiting"; label: string }
  | { kind: "failed"; headline: string; body: string; action: string; next: () => void };

export interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SignInModal({ open, onOpenChange }: SignInModalProps) {
  const shell = useWalletShell();
  const choices = useWalletChoices();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const phone = usePhoneLayout();

  // `created`: a brand-new passkey account; the shell funds it once the modal is gone.
  async function run(label: string, attempt: () => Promise<ConnectOutcome>, created = false) {
    setStep({ kind: "waiting", label });
    const result = await attempt();
    if (result.ok) {
      setStep({ kind: "choose" });
      onOpenChange(false);
      // Signed in to place an order (`pickerIntent`): the funding says so in a toast, never a modal over the order (R4-4).
      if (created) window.dispatchEvent(new CustomEvent(ACCOUNT_CREATED_EVENT, { detail: { forOrder: shell.pickerIntent !== null } }));
      return;
    }
    // A cancel (or no passkey on this phone — WebAuthn won't say which) returns quietly; after a passkey sign-in, one
    // line points at creating an account.
    if (result.aborted) {
      setStep({ kind: "choose", ...(label === SIGN_IN.waiting.passkey && !created ? { hint: SIGN_IN.noneChosen } : {}) });
      return;
    }
    const retry = () => void run(label, attempt, created);
    const passkey = passkeyFailure(result.error);
    if (passkey) {
      const f = SIGN_IN.failures[passkey];
      const next = passkey === "exists" ? () => void run(SIGN_IN.waiting.passkey, () => choices.signInPasskey()) : passkey === "unsupported" ? () => setStep({ kind: "choose" }) : retry;
      setStep({ kind: "failed", headline: f.headline, body: f.body, action: f.action, next });
      return;
    }
    // Anything else (the network, the server): the diagnosis in words; the raw reason goes to the console, not the sheet.
    const diagnosis = diagnose(result.error);
    console.warn("sign-in failed:", diagnosis.technical);
    const copy = diagnosisCopy(diagnosis.kind);
    setStep({ kind: "failed", headline: copy.headline, body: copy.body, action: SIGN_IN.retry, next: retry });
  }

  const connectRow = (connector: Connector) => (
    <Row
      key={connector.uid}
      icon={connector.icon ? <WalletIcon src={connector.icon} size={28} /> : <GlyphIcon><Wallet className="size-4" /></GlyphIcon>}
      name={connector.name}
      onClick={() => void run(SIGN_IN.waiting.wallet(connector.name), () => choices.connect(connector))}
    />
  );

  const busy = step.kind === "waiting";
  const close = (next: boolean) => {
    if (busy && !next) return;
    if (!next) setStep({ kind: "choose" });
    onOpenChange(next);
  };

  return (
    <WalletDialog open={open} onOpenChange={close} compact>
      {phone && step.kind === "failed" ? (
        <SignInPhoneFailure headline={step.headline} body={step.body} action={step.action} onAction={step.next} onBack={() => setStep({ kind: "choose" })} />
      ) : phone && (step.kind === "choose" || step.kind === "waiting") ? (
        <SignInPhone
          choices={choices}
          intent={shell.pickerIntent}
          hint={step.kind === "choose" ? (step.hint ?? null) : null}
          busy={step.kind === "waiting" ? step.label : null}
          run={(label, attempt, created) => void run(label, attempt, created)}
          onLearn={() => setStep({ kind: "learn" })}
        />
      ) : (
        <div className="wm-options">
          {step.kind === "choose" ? (
            <div className="wm-list-col">
              <div className="wm-list-head">
                <div className="wm-list-head-spacer" />
                <div className="wm-list-title">
                  <Dialog.Title render={<h1 />} className="wm-t18">
                    {SIGN_IN.title}
                  </Dialog.Title>
                  {/* The order this sign-in is for (the video's rule, D-224): "to place UP · $25.00". */}
                  {shell.pickerIntent ? <p className="wm-t14m wm-intent">{shell.pickerIntent}</p> : null}
                </div>
                <div className="wm-list-close">
                  <CloseButton />
                </div>
              </div>
              <div className="wm-scroll">
                <Group name={T.groups.passkey(ACCOUNT.network[shell.network])} accent>
                  <Row icon={<GlyphIcon accent><Fingerprint className="size-4" /></GlyphIcon>} name={T.rows.create} disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.createPasskey(""), true)} />
                  <Row icon={<GlyphIcon><KeyRound className="size-4" /></GlyphIcon>} name={T.rows.signIn} disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.signInPasskey())} />
                </Group>
                <Group name={T.groups.wallets}>
                  {choices.tempoWallet ? connectRow(choices.tempoWallet) : null}
                  {choices.injected.map((c) => connectRow(c))}
                  {choices.walletConnect ? connectRow(choices.walletConnect) : null}
                  {!choices.tempoWallet && choices.injected.length === 0 && !choices.walletConnect ? <p className="wm-t14m px-1.5">{SIGN_IN.noInjected}</p> : null}
                </Group>
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
                  <Dialog.Title className="wm-t18">{step.kind === "learn" ? T.intro.title : SIGN_IN.title}</Dialog.Title>
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
                        <ActionButton label={T.intro.get} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.createPasskey(""), true)} />
                      </div>
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
                      <p className="type-body-strong text-ink">{SIGN_IN.nothingTaken}</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={step.next} className="min-h-touch rounded-md bg-accent-fill px-4 type-body-strong text-on-accent">{step.action}</button>
                        <button type="button" onClick={() => setStep({ kind: "choose" })} className="min-h-touch rounded-md border border-border-strong px-4 type-body-strong text-ink">{SIGN_IN.back}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
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

/** One row of the list (Owarine `WalletRow`): the icon and the name. */
function Row({ icon, name, disabled = false, onClick }: { icon: ReactNode; name: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} className="wm-row wm-touch wm-shrink disabled:opacity-50" onClick={onClick}>
      <span className="wm-row-inner">
        {icon}
        <span className="min-w-0">
          <span className="wm-row-name">{name}</span>
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
