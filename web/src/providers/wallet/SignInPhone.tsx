"use client";
// Ported from Owarine 90a91d71:web/src/providers/wallet/WalletPickerPhone.tsx (RainbowKit 2.2.11's `MobileOptions` in
// its bottom sheet; R4-8, D-227) on the ported `.wm-m-*` frame: the centred title and the order this sign-in is for,
// then the passkey actions first and large in the thumb zone — "Create account" (vermilion) and "I have a passkey" —
// a divider, the wallets as a strip of app tiles (a spinner ring on the one connecting), and "New to passkeys?". Below
// 768 px only; the waiting step stays SignInModal's, shared with the desktop list. Round 7: a failure has its own phone
// frame (`SignInPhoneFailure`) and a quiet hint can sit under the passkey buttons.
import { Dialog } from "@base-ui/react/dialog";
import { Fingerprint, KeyRound, Wallet } from "lucide-react";
import type { Connector } from "wagmi";
import { SIGN_IN, WALLET_MODAL as T } from "./copy";
import type { ConnectOutcome, WalletChoices } from "./useWalletChoices";
import { CloseButton, NoWallet, Spinner, WalletIcon } from "./wallet-modal-parts";

export interface SignInPhoneProps {
  choices: WalletChoices;
  /** The order this sign-in is for ("to place UP · $25.00"), or null. */
  intent: string | null;
  /** One quiet line under the passkey buttons (after a passkey sign-in that came back with none), or null. */
  hint?: string | null;
  /** What is being waited on (a passkey prompt or a wallet), or null. */
  busy: string | null;
  run: (label: string, attempt: () => Promise<ConnectOutcome>, created?: boolean) => void;
  onLearn: () => void;
  onReview: () => void;
}

export function SignInPhone({ choices, intent, hint = null, busy, run, onLearn, onReview }: SignInPhoneProps) {
  const wallets = [choices.tempoWallet, ...choices.injected, choices.walletConnect].filter((c): c is Connector => c !== null);
  const passkeyBusy = busy === SIGN_IN.waiting.passkey;
  return (
    <div className="wm-mobile" aria-busy={busy !== null}>
      <div className="wm-m-head">
        <div className="wm-m-head-row">
          <Dialog.Title render={<h1 />} className="wm-m-title">
            {SIGN_IN.title}
          </Dialog.Title>
          <div className="wm-m-close">
            <div>
              <CloseButton phone />
            </div>
          </div>
        </div>
        {intent ? <p className="wm-m-intent">{intent}</p> : null}
      </div>

      <div className="wm-m-primary">
        <button type="button" className="wm-m-btn wm-m-btn--accent" disabled={!choices.passkey || busy !== null} onClick={() => run(SIGN_IN.waiting.passkey, () => choices.createPasskey(""), true)}>
          {passkeyBusy ? <Spinner /> : <Fingerprint aria-hidden />}
          {T.rows.create}
        </button>
        <button type="button" className="wm-m-btn" disabled={!choices.passkey || busy !== null} onClick={() => run(SIGN_IN.waiting.passkey, () => choices.signInPasskey())}>
          <KeyRound aria-hidden />
          {T.rows.signIn}
        </button>
      </div>

      {hint ? <p className="wm-m-hint" role="status">{hint}</p> : null}
      <div className="wm-m-divider" />
      <p className="wm-m-label">{T.groups.wallets}</p>
      {choices.injected.length === 0 ? <NoWallet className="wm-m-none" /> : null}
      {wallets.length === 0 ? null : (
        <div className="wm-m-strip">
          {wallets.map((connector) => {
            const label = SIGN_IN.waiting.wallet(connector.name);
            const connecting = busy === label;
            return (
              <button key={connector.uid} type="button" className="wm-m-tile" disabled={busy !== null} onClick={() => run(label, () => choices.connect(connector))}>
                <span className="wm-m-tile-art">
                  {connecting ? <Spinner /> : null}
                  {connector.icon ? (
                    <WalletIcon src={connector.icon} size={60} ring={false} />
                  ) : (
                    <span aria-hidden className="wm-icon wm-icon--60 wm-glyph-icon">
                      <Wallet />
                    </span>
                  )}
                </span>
                <span className="wm-m-tile-name">{connector.name}</span>
                {choices.badge(connector) ? <span className="wm-badge wm-badge--tile">{SIGN_IN.badge[choices.badge(connector)!]}</span> : null}
              </button>
            );
          })}
        </div>
      )}

      {busy ? (
        <p role="status" aria-live="polite" className="sr-only">
          {busy}
        </p>
      ) : null}
      <div className="wm-m-foot">
        <span className="wm-t14m">{T.newTo}</span>
        <button type="button" className="wm-link wm-touch wm-t14b wm-accent" onClick={onLearn} disabled={busy !== null}>
          {T.learnMore}
        </button>
        {choices.reviewer ? <button type="button" className="wm-link wm-touch wm-t14m" onClick={onReview} disabled={busy !== null}>Review access</button> : null}
      </div>
    </div>
  );
}

/**
 * A sign-in that failed, in the phone sheet's own frame (round 7: it used the desktop step on phones): what happened in
 * one line, what to do in another, the one action that fixes it, and Back. Never the raw error.
 */
export function SignInPhoneFailure({ headline, body, action, onAction, onBack }: { headline: string; body: string; action: string; onAction: () => void; onBack: () => void }) {
  return (
    <div className="wm-mobile" role="alert">
      <div className="wm-m-head">
        <div className="wm-m-head-row">
          <Dialog.Title render={<h1 />} className="wm-m-title">
            {headline}
          </Dialog.Title>
          <div className="wm-m-close">
            <div>
              <CloseButton phone />
            </div>
          </div>
        </div>
        <p className="wm-m-intent">{body}</p>
      </div>
      <div className="wm-m-primary">
        <button type="button" className="wm-m-btn wm-m-btn--accent" onClick={onAction}>
          {action}
        </button>
        <button type="button" className="wm-m-btn" onClick={onBack}>
          {SIGN_IN.back}
        </button>
      </div>
      <p className="wm-m-hint">{SIGN_IN.nothingTaken}</p>
    </div>
  );
}
