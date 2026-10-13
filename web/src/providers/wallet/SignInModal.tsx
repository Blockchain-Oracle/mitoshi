"use client";

// The one sign-in modal (plan C.3.1; D-046), in Owarine 90a91d71's compact picker (`WalletPicker`, RainbowKit 2.2.11's
// compact connect modal as Masayume shipped it — O-9, D-222/D-223): a title, grouped rows — passkey first, then wallets
// — and "New to passkeys? Learn more". One frame (D-224, Owarine's seat): "Create account" goes straight to the passkey
// prompt and the modal closes on it; the server funds the new account from the shell (`FirstFund`) and the welcome card
// says so. A choice shows a named wait or a failure with its retry. Below 768 px the panel is the bottom sheet (D-222).
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
import { SIDE_CHAINS } from "./wagmi-config";
import { ActionButton, BackButton, CloseButton, Spinner, WalletDialog, WalletIcon } from "./wallet-modal-parts";
import { useWalletShell } from "./wallet-shell-context";

type Step =
  | { kind: "choose" }
  | { kind: "learn" }
  | { kind: "waiting"; label: string }
  | { kind: "failed"; headline: string; body: string; technical: string; retry: () => void };

export interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SignInModal({ open, onOpenChange }: SignInModalProps) {
  const shell = useWalletShell();
  const choices = useWalletChoices();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const robinhood = shell.pickerMode === "robinhood";

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
                {/* The order this sign-in is for (the video's rule, D-224): "to place UP · $25.00". */}
                {!robinhood && shell.pickerIntent ? <p className="wm-t14m wm-intent">{shell.pickerIntent}</p> : null}
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
                    <Row icon={<GlyphIcon accent><Fingerprint className="size-4" /></GlyphIcon>} name={T.rows.create} disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.createPasskey(""), true)} />
                    <Row icon={<GlyphIcon><KeyRound className="size-4" /></GlyphIcon>} name={T.rows.signIn} disabled={!choices.passkey} onClick={() => void run(SIGN_IN.waiting.passkey, () => choices.signInPasskey())} />
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
