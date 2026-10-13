"use client";
// The in-flight tracker (R4-12, D-227; S14w E.3): one status line that names where the stock is — never a bare
// spinner — over the route map, a live elapsed timer (the shared clock), the legs for screen readers, and the one
// thing to do when there is one: trade what arrived, claim a held credit (relay-sponsored, "No fees to pay") or send
// it back, or start again. Shown in the card after signing and in Portfolio's drawer.
import { deliveredLegs, layerZeroMessageUrl, routeOf, type Hex, type TxState } from "@cwf/core";
import { bridgeTopology, claimOwed, quoteBridgeOut } from "@cwf/markets/stocks";
import Link from "next/link";
import { useState } from "react";
import { useNowMs } from "@/components/data/useNowMs";
import { TxCta, useTxLifecycle } from "@/components/tx";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { BRIDGE } from "./copy";
import { clock, sd } from "./format";
import { LegSteps } from "./LegSteps";
import { RouteMap } from "./RouteMap";
import { bridgeClients, NETWORK, RH_CHAIN_ID } from "./useBridge";
import type { TrackerModel } from "./useTracker";

const T = BRIDGE.track;
const ENDED = new Set(["delivered", "released", "returned", "reverted", "failed"]);
const firstLine = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 160);

export function TrackerView({ tracker, showLegs = false }: { tracker: TrackerModel; showLegs?: boolean }) {
  const shell = useWalletShell();
  const nowMs = useNowMs() || Date.now();
  const claim = useTxLifecycle();
  const sendBack = useTxLifecycle();
  // The bridge-out's held unlock is claimed on Robinhood Chain with the linked wallet (not a Tempo intent).
  const [owed, setOwed] = useState<TxState>({ kind: "idle" });
  const [actionError, setActionError] = useState<string | null>(null);
  const t = tracker.tracked!;
  const route = routeOf(t.direction, NETWORK);
  const adv = tracker.advance;
  const legs = adv?.legs ?? [];
  const delivered = deliveredLegs(legs.map((l) => ({ guid: l.guid as Hex | null, status: l.status })));
  const amount = sd(BigInt(t.amountSD));
  const arriving = t.direction === "in" ? `b${t.ticker}` : t.ticker;
  const phase = adv?.phase ?? "sent";
  const ended = adv ? ENDED.has(adv.status) : false;
  // The clock runs until the end; a delivery keeps its measured time, any other end drops it.
  const stopped = ended && adv?.status !== "delivered";
  const elapsedSec = ((adv?.deliveredAtMs ?? nowMs) - t.startedAtMs) / 1000;
  const current = legs.find((l) => l.status !== "delivered") ?? legs[legs.length - 1];
  const reason = legs.find((l) => l.deferReason)?.deferReason ?? "none";
  const lzLink = (phase === "slow" || phase === "failed" || phase === "returned") && current?.guid;

  const line =
    phase === "delivered" ? T.delivered(amount, arriving)
    : phase === "hop" ? T.hop
    : phase === "deferred" ? T.deferred(BRIDGE.defer[reason] ?? BRIDGE.defer.none!)
    : phase === "released" ? T.released
    : phase === "returned" ? T.returned(BRIDGE.chain[route.stops[0]!])
    : phase === "failed" ? T.failed
    : phase === "fuel" ? T.fuel
    : phase === "slow" ? T.slow
    : phase === "nothing" ? T.nothing
    : T.sent(BRIDGE.chain[route.stops[0]!]);

  const runClaim = async () => {
    setActionError(null);
    if (t.direction === "in") {
      await claim.run({ kind: "bridge-claim-deferred", ticker: t.ticker });
      return;
    }
    if (!shell.robinhood) return shell.openPicker("robinhood");
    const lockbox = bridgeTopology(NETWORK).tickers[t.ticker].lockbox;
    if (!lockbox) return;
    setOwed({ kind: "signing" });
    try {
      setOwed({ kind: "confirmed", txHash: await claimOwed(await shell.sideWallet(RH_CHAIN_ID), lockbox), pending: false });
    } catch (error) {
      setOwed({ kind: "idle" });
      if (!/reject|denied|cancel/i.test(firstLine(error))) setActionError(firstLine(error));
    }
  };
  const runSendBack = async () => {
    setActionError(null);
    const rh = shell.robinhood?.address;
    if (!rh) return shell.openPicker("robinhood");
    const q = await quoteBridgeOut(await bridgeClients(), t.ticker, BigInt(t.amountSD), rh);
    if (!q.ok) return setActionError(q.error.technical);
    await sendBack.run({ kind: "bridge-send-deferred", ticker: t.ticker, amountSD: q.value.sentSD, recipient: rh, feeBase: q.value.nativeFee });
  };

  return (
    <div className="btr" data-phase={phase}>
      <div className="btr-head">
        <p className="btr-line" role="status" aria-live="polite">
          {line}
          {lzLink ? (
            <>
              {" · "}
              <a href={layerZeroMessageUrl(current!.guid as Hex, NETWORK)} target="_blank" rel="noreferrer">{T.lzscan}</a>
            </>
          ) : null}
        </p>
        {stopped ? null : <span className="numbers btr-clock" aria-label={T.elapsed}>{clock(elapsedSec)}</span>}
      </div>
      {phase === "fuel" ? <p className="btr-note">{T.fuelNote}</p> : null}
      <RouteMap route={route} legs={legs} delivered={delivered} symbol={t.ticker} />
      <LegSteps route={route} legs={legs} className={showLegs ? "btr-legs" : "sr-only"} />
      {phase === "delivered" && t.direction === "in" ? <Link href={`/trade/${t.ticker}`} className="btr-act">{T.trade}</Link> : null}
      {phase === "deferred" ? (
        <div className="btr-acts">
          <TxCta state={t.direction === "in" ? claim.state : owed} action={T.claim(amount, arriving)} signer={t.direction === "in" && shell.tempo?.kind === "passkey" ? "passkey" : "injected"} sponsored={t.direction === "in"} onConfirm={() => void runClaim()} />
          {t.direction === "in" ? (
            <button type="button" className="btr-secondary" onClick={() => void runSendBack()} disabled={sendBack.state.kind === "signing" || sendBack.state.kind === "submitted"}>
              {T.sendBack}
            </button>
          ) : null}
        </div>
      ) : null}
      {actionError ? <p className="brc-error" role="alert">{actionError}</p> : null}
      {ended || phase === "deferred" ? (
        <button type="button" className="btr-secondary" onClick={tracker.clear}>{T.again}</button>
      ) : null}
    </div>
  );
}
