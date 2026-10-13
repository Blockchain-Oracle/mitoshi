"use client";
// Ported from Owarine 90a91d71:web/src/features/x/TradeFromXScreen.tsx — S11 (D-227): sign in with X → link the account
// (its passkey or wallet signs) → fund X trading (one EXECUTOR grant) → post a call. Owarine's hero, custody rail and
// proof links are cut to one line (terse copy); the active step's action sits on the first phone screen; the account is
// asked for only at the step that needs it (D-224).
import type { Address } from "@cwf/core";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { shortAddress } from "@/providers/wallet/format";
import { PillButton } from "@/components/kit/PillButton";
import { TFX } from "./copy";
import { FundStep } from "./FundStep";
import { RelayLine, Step, XGlyph, type StepState } from "./parts";
import { useXGrant } from "./useXGrant";
import { useXLink } from "./useXLink";
import { XInstructionBuilder } from "./XInstructionBuilder";
import { XReceiptsList, useXReceipts } from "./XReceiptsList";
import "./x.css";

const RETURN_TO = "/trade-from-x";

export function TradeFromXScreen() {
  const session = useWalletSession();
  const link = useXLink();
  const grant = useXGrant();
  const nowMs = useNowMs();
  const status = link.status;
  const handle = status?.handle ?? "Mitoshi_app";
  const xs = status?.session ?? null;
  const executor = (status?.relay?.running ? status.relay.executor : null) as Address | null;
  const receipts = useXReceipts(xs !== null);
  const funded = grant.permission(executor) === "ready";
  const step = !xs ? 1 : !link.linkedHere ? 2 : !funded ? 3 : 4;
  const stateOf = (n: number): StepState => (step > n ? "done" : step === n ? "active" : "idle");
  const me = xs?.handle ?? xs?.authorId ?? "";

  return (
    <section className="xt">
      <header className="xt-head">
        <h1 className="type-display text-ink">{TFX.title}</h1>
        <p className="xt-lede">{TFX.lede(handle)}</p>
      </header>

      <ol className="xt-steps" id="x-trading">
        <Step n={1} title={TFX.steps.x} state={stateOf(1)} past={step > 1}>
          {xs ? (
            <span className="xt-done"><XGlyph /> <strong>{TFX.signedInAs(me)}</strong></span>
          ) : link.loading ? null : link.unreadable ? (
            <p className="xt-note">{TFX.unreadable}</p>
          ) : !status?.configured ? (
            <p className="xt-note">{TFX.waitsOn}</p>
          ) : (
            <PillButton tone="accent" size="lg" block disabled={link.busy !== ""} aria-busy={link.busy === "start"} onClick={() => void link.start(RETURN_TO)}>
              <XGlyph /> {TFX.signIn}
            </PillButton>
          )}
        </Step>
        <Step n={2} title={TFX.steps.link} state={stateOf(2)} past={step > 2}>
          {link.linkedHere ? (
            <span className="xt-done">{TFX.linked(me)}</span>
          ) : (
            <>
              {status?.binding && session.address && status.binding.account.toLowerCase() !== session.address.toLowerCase() ? <p className="xt-note">{TFX.otherAccount(shortAddress(status.binding.account))}</p> : null}
              <PillButton tone="accent" size="lg" block disabled={link.busy !== ""} aria-busy={link.busy === "link"} onClick={() => void link.link()}>
                {link.busy === "link" ? TFX.linking : status?.binding && session.address ? TFX.relink(me) : TFX.linkAs(me)}
              </PillButton>
            </>
          )}
        </Step>
        <Step n={3} title={TFX.steps.fund} state={stateOf(3)} past={step > 3}>
          <FundStep grant={grant} executor={executor} disabled={!link.linkedHere} />
        </Step>
      </ol>
      {link.error ? <p className="xt-err" role="alert">{link.error}</p> : null}
      {link.ok ? <p className="xt-ok" role="status">{link.ok}</p> : null}

      <RelayLine relay={status?.relay ?? null} nowMs={nowMs} />
      <XInstructionBuilder handle={handle} enabled={step === 4} />
      <XReceiptsList feed={receipts} signedIn={xs !== null} />
      {link.linkedHere ? (
        <PillButton tone="ghost" size="sm" className="self-start" disabled={link.busy !== ""} onClick={() => void link.unlink()}>{TFX.unlink}</PillButton>
      ) : null}
      <p className="xt-foot">{TFX.testnet}</p>
    </section>
  );
}
