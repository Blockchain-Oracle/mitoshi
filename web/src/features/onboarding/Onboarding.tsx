"use client";
/**
 * The rest of the one ceremony (D-046), shown inside the sign-in modal right after a passkey is created: the server
 * faucet funds the account with no second prompt (the passkey session proves it), the receipt shows what arrived, the
 * arm slot offers whatever makes the next taps prompt-free (empty until S4/S7 register a step), and the CTA lands on
 * /markets. On mainnet there is no faucet: the step offers Add dollars instead.
 */
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { FUNDING, FundedReceipt, suppressWelcome, useFaucetClaim } from "@/features/funding";
import { openFunds } from "@/lib/funds-event";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { armStepsFor } from "./arm-steps";
import { ONBOARD } from "./copy";

const primary = "inline-flex h-(--ticket-cta-height) w-full items-center justify-center gap-2 rounded-md bg-accent-fill px-5 type-body-strong text-on-accent";
const secondary = "inline-flex min-h-touch w-full items-center justify-center rounded-md border border-border-strong px-4 type-body-strong text-ink";
const CHAIN_ID = webEnv.markets.network === "mainnet" ? 4217 : 42431;

export function Onboarding({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const session = useWalletSession();
  const shell = useWalletShell();
  const testnet = webEnv.markets.network === "testnet";
  const faucet = useFaucetClaim({ address: session.address, viaSession: true });
  const started = useRef(false);
  const { state } = faucet;

  useEffect(() => suppressWelcome(), []);
  useEffect(() => {
    if (!testnet || !session.address || started.current) return;
    started.current = true;
    void faucet.claim();
  }, [testnet, session.address, faucet]);

  const land = () => {
    onClose();
    router.push("/markets");
  };
  const arm = armStepsFor(CHAIN_ID);

  if (!testnet) {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-body text-ink-secondary">{ONBOARD.mainnetBody}</p>
        <button type="button" className={primary} onClick={() => { onClose(); openFunds(); }}>{ONBOARD.addDollars}</button>
        <button type="button" className={secondary} onClick={land}>{ONBOARD.go}</button>
      </div>
    );
  }
  if (state.phase === "idle" || state.phase === "funding" || state.phase === "signing") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 aria-hidden className="size-6 animate-spin text-ink-secondary motion-reduce:animate-none" />
        <p className="type-body-strong text-ink">{ONBOARD.funding}</p>
        <p className="type-caption text-ink-secondary">{ONBOARD.fundingBody}</p>
      </div>
    );
  }
  if (state.phase === "failed") {
    return (
      <div role="alert" className="flex flex-col gap-3">
        <p className="type-body text-ink-secondary">{ONBOARD.failedBody}</p>
        <p className="type-body-strong text-ink">{FUNDING.errors[state.code]}</p>
        <button type="button" className={primary} onClick={() => void faucet.claim()}>{ONBOARD.retry}</button>
        <button type="button" className={secondary} onClick={land}>{ONBOARD.skip}</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body text-ink-secondary" role="status">{ONBOARD.fundedBody}</p>
      {session.address ? <FundedReceipt address={session.address} txHashes={state.claim.txHashes} atMs={state.atMs} /> : null}
      {arm.map((step) => <div key={step.id}>{step.render({ onDone: land })}</div>)}
      {/* While an arm is on offer it holds the primary action; going on without it is the quiet choice. */}
      <button type="button" className={arm.length > 0 && !shell.walletKey && shell.canArmWalletKey ? secondary : primary} onClick={land}>{ONBOARD.go}</button>
    </div>
  );
}
