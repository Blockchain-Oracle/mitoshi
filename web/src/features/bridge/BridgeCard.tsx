"use client";
// The bridge as one card (R4-12, D-227): from 21st.dev 16251 starc007/be-ui-multi-chain-swap (From/To panels, the
// flip over the seam, one route row, one button), revamped per D-044 onto Mitoshi's tokens, with Owarine 90a91d71
// `features/funding/CcRailPanel.tsx`'s header (mark · title · Live/Not-live badge), its one honest not-live line and
// its rules behind one disclosure. The button (TxCta) names the next thing to do (`./blockers`); after the source hash
// the body cross-fades into the tracker. Not ported on purpose: Owarine's Sheet, Keypad and SwipeToConfirm (the wallet
// or passkey prompt is the confirmation, and a keypad would push the CTA off a phone).
import { BRIDGE_TICKERS, formatBaseUnits, toShared, type BridgeTicker } from "@cwf/core";
import { ArrowDownUp } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { TxCta, type SignerKind } from "@/components/tx";
import { WalletWait } from "@/components/ui/pending";
import { webEnv } from "@/lib/env";
import { FromPanel, ToPanel, Who } from "./ChainPanel";
import { BRIDGE } from "./copy";
import { eth, sd } from "./format";
import { RouteLine } from "./RouteLine";
import { TokenPicker } from "./TokenPicker";
import { TrackerView } from "./TrackerView";
import { FAUCET_URL, NETWORK, RH_CHAIN_ID, type BridgeModel } from "./useBridge";
import type { TrackerModel } from "./useTracker";
import type { BridgeStep } from "./blockers";

const C = BRIDGE.cta;
const FADE = { duration: 0.22 } as const;

function label(s: BridgeStep, ticker: string, from: string, amount: string): string {
  switch (s.kind) {
    case "amount": return C.amount;
    case "link": return C.link;
    case "switch-chain": return C.switchChain;
    case "faucet": return C.faucet(ticker);
    case "sign-in": return C.signIn;
    case "not-enough": return C.notEnough(from);
    case "not-enough-fee": return C.notEnoughFee;
    case "over-limit": return C.overLimit;
    case "not-live": return C.notLive;
    case "not-connected": return C.onlyFor(ticker);
    case "paused": return C.paused;
    case "quoting": return C.quoting;
    case "approve": return C.approve(ticker);
    case "bridge": return C.bridge(amount, from);
  }
}

/** A dollar fee rounded up to the cent (the LZD fee is pathUSD 1:1). */
const usdUp = (base: bigint) => formatBaseUnits(((base + 9_999n) / 10_000n) * 10_000n, 6, { maxDp: 2, minDp: 2 });
const noWalletHere = () => typeof window !== "undefined" && !("ethereum" in window) && !webEnv.walletConnectProjectId;

export function BridgeCard({ model: mo, tracker }: { model: BridgeModel; tracker: TrackerModel }) {
  const reduced = useReducedMotion();
  const [picking, setPicking] = useState(false);
  const shell = mo.shell;
  const inbound = mo.direction === "in";
  const from = inbound ? mo.ticker : `b${mo.ticker}`;
  const to = inbound ? `b${mo.ticker}` : mo.ticker;
  const amountText = mo.amountSD ? sd(mo.amountSD) : "";
  const links = mo.links?.ok ? mo.links.value : null;
  const quote = mo.quote?.ok ? mo.quote.value : null;
  const rh = mo.rh?.ok ? mo.rh.value : null;
  const tempo = mo.tempo?.ok ? mo.tempo.value : null;
  const live = links ? (inbound ? links.inReady : links.outReady) : null;
  const badge = !links ? null : !links.robinhoodLive ? BRIDGE.badge.notLive : live ? BRIDGE.badge.live : BRIDGE.badge.partial(mo.ticker);
  const balanceSD = inbound ? (rh ? toShared(rh.stockLD, 18) : null) : tempo ? tempo.mirrorSD : null;
  const fee = quote ? (inbound ? BRIDGE.fee(eth(quote.nativeFee), "ETH") : BRIDGE.feeUsd(usdUp(quote.nativeFee))) : null;
  const eta = mo.api.data?.eta[mo.direction] ?? null;
  const cap = mo.capacity?.ok ? mo.capacity.value : null;
  const step = mo.step;
  const signer: SignerKind = inbound ? "injected" : shell.tempo?.kind === "passkey" ? "passkey" : "injected";
  const txKind = mo.tx.state.kind;
  const txLive = !inbound && (txKind === "signing" || txKind === "submitted" || txKind === "unknown" || txKind === "confirmed" || (txKind === "failed" && step.actionable));
  const state = txLive ? mo.tx.state : mo.sideStep ? ({ kind: "signing" } as const) : step.actionable ? ({ kind: "idle" } as const) : ({ kind: "blocked", reason: label(step, mo.ticker, from, amountText) } as const);
  const balances = Object.fromEntries(BRIDGE_TICKERS.map((t) => [t, inbound && mo.rhAll?.ok && mo.rhAll.value[t] !== undefined ? sd(toShared(mo.rhAll.value[t]!, 18)) : !inbound && t === mo.ticker && tempo ? sd(tempo.mirrorSD) : undefined]).filter(([, v]) => v !== undefined));

  const act = () => {
    const intent = BRIDGE.intent(amountText, to);
    if (step.kind === "link") return shell.openPicker("robinhood");
    if (step.kind === "switch-chain") return void shell.switchSide(RH_CHAIN_ID).catch(() => undefined);
    if (step.kind === "faucet") return void window.open(FAUCET_URL, "_blank", "noopener,noreferrer");
    if (step.kind === "sign-in" || step.needsSignIn) return shell.openPicker("tempo", intent);
    if (step.kind === "approve" || step.kind === "bridge") return void mo.submit();
  };

  const rhWho = <Who address={shell.robinhood?.address ?? null} you={false} onLink={() => shell.openPicker("robinhood")} />;
  const tempoWho = <Who address={shell.tempo?.address ?? null} you />;
  const tracking = tracker.tracked !== null;
  const [reopen, setReopen] = useState<string | null>(null);
  const waiting = mo.sideStep !== null;
  useEffect(() => {
    if (!waiting) return setReopen(null);
    void shell.sideReopenUrl().then(setReopen);
  }, [waiting, shell]);
  const { dispatch } = mo.tx;
  // Back from a finished transfer, the button starts fresh (a confirmed bridge-out would otherwise stay "Confirmed").
  useEffect(() => {
    if (!tracking) dispatch({ type: "reset" });
  }, [tracking, dispatch]);

  return (
    <section className="brc" aria-label={BRIDGE.title} data-direction={mo.direction}>
      <header className="brc-head">
        <span className="brc-head-title">{BRIDGE.chain[inbound ? "robinhood" : "tempo"]} → {BRIDGE.chain[inbound ? "tempo" : "robinhood"]}</span>
        {badge ? <span className="brc-badge" data-live={live ? "" : undefined}>{badge}</span> : null}
      </header>
      <AnimatePresence mode="wait" initial={false}>
        {tracking ? (
          <m.div key="track" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} transition={reduced ? { duration: 0 } : FADE}>
            <TrackerView tracker={tracker} />
          </m.div>
        ) : (
          <m.div key="form" className="brc-body" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} transition={reduced ? { duration: 0 } : FADE}>
            <FromPanel
              stop={inbound ? "robinhood" : "tempo"}
              who={inbound ? rhWho : tempoWho}
              symbol={from}
              amount={mo.amount}
              onAmount={mo.setAmount}
              onPick={() => setPicking(true)}
              balance={balanceSD !== null ? sd(balanceSD) : null}
              onMax={balanceSD !== null && balanceSD > 0n ? () => mo.setAmount(formatBaseUnits(balanceSD, 6, { maxDp: 6, minDp: 0, group: false })) : null}
            />
            <div className="brc-seam">
              <button type="button" className="brc-flip" aria-label={BRIDGE.flip} onClick={mo.flip}>
                <ArrowDownUp aria-hidden className="size-4" />
              </button>
            </div>
            <ToPanel stop={inbound ? "tempo" : "robinhood"} who={inbound ? tempoWho : rhWho} gets={quote ? BRIDGE.get(sd(quote.receivedSD), to) : mo.amountSD ? BRIDGE.get(amountText, to) : null} />
            <RouteLine fee={fee} via={NETWORK === "testnet"} etaSec={eta?.medianSec ?? null} capacity={cap ? { availableSD: cap.availableSD, capacitySD: cap.capacitySD } : null} />
            {mo.sideStep ? (
              <WalletWait title={mo.sideStep === "approving" ? BRIDGE.track.approving : BRIDGE.track.wallet} note={mo.sideStep === "approving" ? undefined : BRIDGE.track.walletNote} action={reopen ? <a href={reopen} className="wwait-reopen">{BRIDGE.track.reopen}</a> : undefined} />
            ) : (
              <TxCta state={state} action={label(step, mo.ticker, from, amountText)} signer={signer} onConfirm={act} className="brc-cta" />
            )}
            {mo.sideError ? <p className="brc-error" role="alert">{mo.sideError}</p> : null}
            {/* The not-live line sits under the button (the badge says it above): nothing pushes the CTA down. */}
            {links && !links.robinhoodLive ? <p className="brc-note">{BRIDGE.notLiveLine}</p> : null}
            {step.kind === "link" && noWalletHere() ? (
              <p className="brc-wallets">
                <span>{BRIDGE.wallets.note}</span>
                <a href={`https://metamask.app.link/dapp/${window.location.host}/bridge`}>{BRIDGE.wallets.metamask}</a>
                <a href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(window.location.href)}`}>{BRIDGE.wallets.coinbase}</a>
              </p>
            ) : null}
            <details className="brc-rules">
              <summary>{BRIDGE.rules}</summary>
              <ul>
                {BRIDGE.rulesLines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          </m.div>
        )}
      </AnimatePresence>
      <TokenPicker open={picking} onOpenChange={setPicking} selected={mo.ticker} prefix={inbound ? "" : "b"} balances={balances as Partial<Record<BridgeTicker, string>>} onPick={mo.setTicker} />
    </section>
  );
}
