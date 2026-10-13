"use client";
// Ported from Owarine 90a91d71:web/src/features/x/{ClaimScreen,ClaimReceiptCard}.tsx — S11 (D-227): a mention only ever
// trades under a grant the account made, so what "waits" is the Trading Balance (and X balance) of the account the X
// account routes to. Signing in with X proves it's the same you; signing in as that account is the claim.
import { formatBaseUnits, USD_DECIMALS, type Address } from "@cwf/core";
import { useVaultSnapshot } from "@cwf/markets/react";
import Link from "next/link";
import { PillButton, pillButtonVariants } from "@/components/kit/PillButton";
import { Masked } from "@/components/kit/Masked";
import { useWalletSession } from "@/lib/wallet-session";
import { shortAddress } from "@/providers/wallet/format";
import { CLAIM, TFX } from "./copy";
import { Step, XGlyph, type StepState } from "./parts";
import { useXLink } from "./useXLink";
import "./x.css";

const RETURN_TO = "/claim";
const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
const BARS = Array.from({ length: 40 }, (_, i) => 2 + ((i * 7 + 3) % 5));

function Ticket({ amount, handle, done }: { amount: bigint | null; handle: string | null; done: boolean }) {
  return (
    <div className="xc-ticket" data-done={done ? "" : undefined}>
      <div className="xc-ticket-head">
        <span>{CLAIM.card.brand}</span>
        <span className="xc-pill">{done ? CLAIM.card.claimed : CLAIM.card.waiting}</span>
      </div>
      <span className="xt-note">{CLAIM.card.balance}</span>
      <span className="xc-figure numbers">{amount !== null ? <Masked>{usd(amount)}</Masked> : CLAIM.card.hidden}</span>
      <span className="xc-sub">{amount !== null ? (handle ? `@${handle}` : "") : CLAIM.card.reveal}</span>
      <div className="xc-bars" aria-hidden>{BARS.map((w, i) => <span key={i} style={{ width: `${w / 16}rem` }} />)}</div>
      <div className="xc-foot"><span>{CLAIM.card.only}</span><span>{CLAIM.card.network}</span></div>
    </div>
  );
}

export function ClaimScreen() {
  const session = useWalletSession();
  const link = useXLink();
  const xs = link.status?.session ?? null;
  const routed = link.status?.binding && xs && link.status.binding.authorId === xs.authorId ? link.status.binding : null;
  const routedTo = (routed?.account ?? null) as Address | null;
  const snap = useVaultSnapshot(routedTo);
  const v = snap?.ok ? snap.value : null;
  const amount = v ? v.account.availableBase + (v.grants.executor && !v.grants.executor.revoked ? v.grants.executor.budgetBase : 0n) : null;
  const here = Boolean(routedTo && session.address && routedTo.toLowerCase() === session.address.toLowerCase());
  const step = !xs ? 1 : here ? 3 : 2;
  const stateOf = (n: number): StepState => (step > n ? "done" : step === n ? "active" : "idle");
  const handle = xs?.handle ?? routed?.handle ?? null;

  return (
    <section className="xt">
      <header className="xt-head">
        <h1 className="type-display text-ink">{amount !== null ? CLAIM.waiting(usd(amount)) : CLAIM.title}</h1>
        <p className="xt-lede">{CLAIM.ask}</p>
      </header>
      <div className="xc">
        <ol className="xt-steps">
          <Step n={1} title={CLAIM.steps.prove} state={stateOf(1)} past={step > 1}>
            {xs ? <span className="xt-done"><XGlyph /> <strong>@{xs.handle ?? xs.authorId}</strong></span>
              : !link.loading && !link.status?.configured ? <p className="xt-note">{TFX.waitsOn}</p>
              : <PillButton tone="accent" size="lg" block disabled={link.busy !== "" || link.loading} onClick={() => void link.start(RETURN_TO)}><XGlyph /> {TFX.signIn}</PillButton>}
          </Step>
          <Step n={2} title={CLAIM.steps.where} state={stateOf(2)} past={step > 2}>
            {!routedTo ? (
              <>
                <p className="xt-note">{CLAIM.noRoute}</p>
                <Link href="/trade-from-x" className={pillButtonVariants({ tone: "ink", size: "md" })}>{CLAIM.setUp}</Link>
              </>
            ) : here ? (
              <span className="xt-done">{CLAIM.thisOne}</span>
            ) : (
              <>
                <p className="xt-note">{CLAIM.routesTo(shortAddress(routedTo))}</p>
                <PillButton tone="accent" size="lg" block onClick={() => session.connectFor(CLAIM.signInAs(shortAddress(routedTo)))}>{CLAIM.signInAs(shortAddress(routedTo))}</PillButton>
              </>
            )}
          </Step>
        </ol>
        <Ticket amount={amount} handle={handle} done={here} />
      </div>
      {here ? <Link href="/portfolio" className={pillButtonVariants({ tone: "accent", size: "lg", block: true })}>{CLAIM.openPortfolio}</Link> : null}
      {link.error ? <p className="xt-err" role="alert">{link.error}</p> : null}
      <p className="xt-foot">{TFX.testMoney}</p>
    </section>
  );
}
