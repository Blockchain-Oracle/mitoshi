"use client";
// Ported from Owarine 90a91d71:web/src/features/x/{CapabilityReceipt,XPermissionPanel}.tsx — S11 (D-227): the X balance
// as one EXECUTOR grant. The CTA is the action with its amount ("Enable X trading · $5"); with no account it opens
// sign-in for that order (D-224); the capability is one line, not a ledger. Renew covers expired and stale grants; Cash
// out stays whenever the grant holds money, the relay down included (review, D-227).
import { formatBaseUnits, USD_DECIMALS, type Address } from "@cwf/core";
import { useState } from "react";
import { PillButton } from "@/components/kit/PillButton";
import { Masked } from "@/components/kit/Masked";
import { TxFailureCard } from "@/components/tx";
import { notifyReceipt } from "@/features/receipts/write-receipt";
import { useWalletSession } from "@/lib/wallet-session";
import { TFX } from "./copy";
import type { XGrantState } from "./useXGrant";

const AMOUNTS = [5n, 10n, 25n] as const;
const ONE = 1_000_000n;
const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

export function FundStep({ grant, executor, disabled }: { grant: XGrantState; executor: Address | null; disabled: boolean }) {
  const session = useWalletSession();
  const [pick, setPick] = useState<bigint>(5n);
  const [said, setSaid] = useState("");
  const amountBase = pick * ONE;
  const state = grant.permission(executor);
  const busy = grant.busy !== "";

  const held = grant.grant && grant.grant.budgetBase > 0n ? grant.grant.budgetBase : null;

  const fund = async () => {
    setSaid("");
    if (!executor) return;
    if (!session.address) return session.connectFor(TFX.fundIntent(usd(amountBase)));
    const outcome = await grant.fund(amountBase, executor);
    if (outcome?.status === "confirmed") {
      setSaid(TFX.funded(usd((grant.balanceBase ?? 0n) + amountBase)));
      notifyReceipt({ title: TFX.funded(usd(amountBase)), figure: usd(amountBase), figureLabel: TFX.balance, txHash: outcome.txHash, atMs: Date.now(), signer: session.kind === "passkey" ? "passkey" : "wallet", sponsored: false });
    }
  };
  const cashOut = async () => {
    setSaid("");
    const before = grant.balanceBase ?? 0n;
    const outcome = await grant.cashOut();
    if (outcome?.status === "confirmed") setSaid(TFX.cashedOut(usd(before)));
  };
  // Stop anytime: whatever the relay says (down, another executor, an expired grant), money in X trading can come back.
  const cashOutButton = (
    <PillButton tone="ghost" size="md" disabled={busy || held === null} aria-busy={grant.busy === "cashout"} onClick={() => void cashOut()}>{TFX.cashOut}</PillButton>
  );
  const done = (
    <>
      {grant.tx.state.kind === "failed" ? <TxFailureCard state={grant.tx.state} onRetry={() => grant.tx.dispatch({ type: "reset" })} /> : null}
      {said ? <p className="xt-ok" role="status">{said}</p> : null}
    </>
  );

  if (!executor || grant.deployed === false) {
    return (
      <>
        <p className="xt-note">{TFX.noExecutor}</p>
        {held !== null ? <div className="xt-row">{cashOutButton}</div> : null}
        {done}
      </>
    );
  }

  const chips = (
    <div className="xt-chips" role="group" aria-label={TFX.balance}>
      {AMOUNTS.map((a) => (
        <button key={a.toString()} type="button" className="xt-chip numbers" aria-pressed={pick === a} disabled={busy} onClick={() => setPick(a)}>
          ${a.toString()}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {state === "ready" && grant.grant ? (
        <>
          <div className="xt-balance">
            <span className="xt-note">{TFX.balance}</span>
            <span className="xt-balance-figure numbers"><Masked>{usd(grant.grant.budgetBase)}</Masked></span>
          </div>
          {chips}
          <div className="xt-row">
            <PillButton tone="ink" size="md" disabled={disabled || busy} aria-busy={grant.busy === "fund"} onClick={() => void fund()}>{TFX.addCta(usd(amountBase))}</PillButton>
            {cashOutButton}
          </div>
        </>
      ) : state === "expired" || state === "mismatch" || state === "update" ? (
        <div className="xt-row">
          <PillButton tone="accent" size="md" disabled={disabled || busy} aria-busy={grant.busy === "renew"} onClick={() => void grant.renew(executor)}>{TFX.renew}</PillButton>
          {held !== null ? cashOutButton : null}
        </div>
      ) : (
        <>
          {chips}
          <PillButton tone="accent" size="lg" block disabled={disabled || busy || state === "checking" && session.address !== null} aria-busy={grant.busy === "fund"} onClick={() => void fund()}>{TFX.fundCta(usd(amountBase))}</PillButton>
          <p className="xt-note">{TFX.can} {TFX.terms}</p>
        </>
      )}
      {done}
    </>
  );
}
