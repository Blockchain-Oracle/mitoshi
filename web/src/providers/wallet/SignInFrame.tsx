"use client";
// The sign-in sheet before the wallet runtime has landed (R6 shell T13; 21st 23557 ddoemonn/skeleton-swap's timing):
// a Sign in tapped on a cold page opens this at once — the same dialog, title, intent and passkey buttons, three wallet
// rows as skeletons — instead of a "Getting sign-in ready…" pill, and the real sheet takes its place without replaying
// the entrance when it mounts (`sign-in-frame-state.ts`). No wagmi here: it is a few kilobytes, preloaded on idle.
import { Dialog } from "@base-ui/react/dialog";
import { Fingerprint, KeyRound } from "lucide-react";
import { useEffect } from "react";
import { ACCOUNT, SIGN_IN, WALLET_MODAL as T } from "./copy";
import { setFrameShowing } from "./sign-in-frame-state";
import { CloseButton, GlyphIcon, Group, Spinner, usePhoneLayout, WalletDialog } from "./wallet-modal-parts";

const SKELETON_ROWS = 3;
const noop = () => undefined;

export interface SignInFrameProps {
  open: boolean;
  intent: string | null;
  network: "testnet" | "mainnet";
  onOpenChange: (open: boolean) => void;
}

export default function SignInFrame({ open, intent, network, onOpenChange }: SignInFrameProps) {
  const phone = usePhoneLayout();
  useEffect(() => {
    setFrameShowing(open);
    return () => setFrameShowing(false);
  }, [open]);
  const skeletons = Array.from({ length: SKELETON_ROWS }, (_, i) => i);
  return (
    <WalletDialog open={open} onOpenChange={onOpenChange} compact>
      {phone ? (
        <div className="wm-mobile" aria-busy>
          <div className="wm-m-head">
            <div className="wm-m-head-row">
              <Dialog.Title render={<h1 />} className="wm-m-title">{SIGN_IN.title}</Dialog.Title>
              <div className="wm-m-close"><div><CloseButton phone /></div></div>
            </div>
            {intent ? <p className="wm-m-intent">{intent}</p> : null}
          </div>
          <div className="wm-m-primary">
            <button type="button" className="wm-m-btn wm-m-btn--accent" disabled><Spinner />{T.rows.create}</button>
            <button type="button" className="wm-m-btn" disabled><KeyRound aria-hidden />{T.rows.signIn}</button>
          </div>
          <div className="wm-m-divider" />
          <p className="wm-m-label">{T.groups.wallets}</p>
          <div className="wm-m-strip">
            {skeletons.map((i) => (
              <span key={i} className="wm-m-tile wm-skel-tile" aria-hidden>
                <span className="wm-skel wm-skel--tile" />
                <span className="wm-skel wm-skel--name" />
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="wm-options">
          <div className="wm-list-col" aria-busy>
            <div className="wm-list-head">
              <div className="wm-list-head-spacer" />
              <div className="wm-list-title">
                <Dialog.Title render={<h1 />} className="wm-t18">{SIGN_IN.title}</Dialog.Title>
                {intent ? <p className="wm-t14m wm-intent">{intent}</p> : null}
              </div>
              <div className="wm-list-close"><CloseButton /></div>
            </div>
            <div className="wm-scroll">
              <Group name={T.groups.passkey(ACCOUNT.network[network])} accent>
                <button type="button" disabled className="wm-row wm-touch disabled:opacity-50" onClick={noop}>
                  <span className="wm-row-inner"><GlyphIcon accent><Fingerprint className="size-4" /></GlyphIcon><span className="wm-row-name">{T.rows.create}</span><Spinner /></span>
                </button>
                <button type="button" disabled className="wm-row wm-touch disabled:opacity-50" onClick={noop}>
                  <span className="wm-row-inner"><GlyphIcon><KeyRound className="size-4" /></GlyphIcon><span className="wm-row-name">{T.rows.signIn}</span></span>
                </button>
              </Group>
              <Group name={T.groups.wallets}>
                {skeletons.map((i) => (
                  <span key={i} className="wm-row wm-skel-row" aria-hidden>
                    <span className="wm-skel wm-skel--icon" />
                    <span className="wm-skel wm-skel--line" />
                  </span>
                ))}
              </Group>
            </div>
          </div>
        </div>
      )}
    </WalletDialog>
  );
}
