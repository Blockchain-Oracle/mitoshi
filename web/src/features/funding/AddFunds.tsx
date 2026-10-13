"use client";
// Add money as Owarine 90a91d71 `features/funding/AddFunds.tsx` (D-224; Abu, 8 Oct: "too much slop text, not supposed
// to be this long"): the account's dollars as one big figure tagged "no cash value", one button (the faucet, or Trade
// once funded), a one-line status only when something needs doing, and the address in a quiet foot. A passkey needs no
// signature; a wallet signs a free message. Mainnet has no faucet: the address is the way in (L-26). Loaded on first open.
// R4-4 (D-227; critic gap 11): on the kit sheet (`SlideOver`: a bottom sheet on a phone, the right drawer on desktop)
// with the button pinned in its footer; the figure wears the privacy mask; the foot is the short address with Copy and
// a QR to receive pathUSD on Tempo; the bridge is the other way in (Owarine's rail card) only once the Robinhood side
// of the stock bridge is deployed — nothing until then.
// The topology alone (pure, the generated deployments): the bridge's clients and reads stay out of this sheet's chunk.
import { bridgeTopology, robinhoodLive } from "@cwf/markets/stocks/topology";
import { useBalanceSheet } from "@cwf/markets/react";
import { shortHex } from "@cwf/core/units";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Loader2, QrCode } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Masked } from "@/components/kit/Masked";
import { PillButton } from "@/components/kit/PillButton";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { dollars } from "@/providers/wallet/format";
import { FUNDING } from "./copy";
import { suppressWelcome } from "./credited";
import { faucetAvailability } from "./faucet-client";
import { FundedReceipt } from "./FundedReceipt";
import { ReceiveQr } from "./ReceiveQr";
import { useFaucetClaim } from "./useFaucetClaim";
import "@/styles/vault.css";
import "@/components/kit/kit.css";

export function laterText(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** The stock bridge's Robinhood side is deployed for some ticker on this network (the generated deployments, no read). */
function useBridgeIn(): boolean {
  return useMemo(() => {
    const network = webEnv.markets.network;
    try {
      return Object.values(bridgeTopology(network).tickers).some((t) => robinhoodLive(t, network));
    } catch {
      return false;
    }
  }, []);
}

export default function AddFunds({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const testnet = webEnv.markets.network === "testnet";
  const faucet = useFaucetClaim({ address: session.address, viaSession: session.kind === "passkey" });
  const bridgeIn = useBridgeIn();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const { state } = faucet;
  // Known refusals (the daily cooldown, a held region) are read up front, so the sheet never offers a button that fails.
  const availability = useQuery({
    queryKey: ["faucet-availability", session.address],
    queryFn: () => faucetAvailability(session.address!),
    enabled: open && testnet && session.address !== null && state.phase === "idle",
    staleTime: 0,
  });
  const blocked = state.phase === "idle" && availability.data && !availability.data.available ? availability.data : null;
  useEffect(() => (open ? suppressWelcome() : undefined), [open]);

  const copy = async () => {
    if (!session.address) return;
    await navigator.clipboard.writeText(session.address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };

  // The one line that needs saying, or nothing.
  const status =
    blocked?.reason ? { text: FUNDING.errors[blocked.reason], when: blocked.nextClaimAtMs, alert: false }
    : state.phase === "failed" ? { text: FUNDING.errors[state.code], when: state.nextClaimAtMs, alert: true }
    : state.phase === "funded" ? { text: FUNDING.modal.done, when: state.claim.nextClaimAtMs, alert: false }
    : null;

  const footer = !session.address ? (
    <PillButton tone="accent" size="lg" block onClick={() => { onOpenChange(false); session.connect(); }}>{FUNDING.modal.signIn}</PillButton>
  ) : testnet ? (
    <div className="flex flex-col gap-2">
      {state.phase === "funded" ? (
        <PillButton tone="ink" size="lg" block nativeButton={false} render={<Link href="/trade/BTC" onClick={() => onOpenChange(false)} />}>
          {FUNDING.modal.trade} <ArrowRight aria-hidden />
        </PillButton>
      ) : (
        <PillButton tone="accent" size="lg" block disabled={faucet.busy || blocked !== null || availability.isPending} aria-busy={faucet.busy} onClick={() => void faucet.claim()}>
          {faucet.busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
          {state.phase === "signing" ? FUNDING.modal.signing : state.phase === "funding" ? FUNDING.modal.funding : FUNDING.modal.request}
        </PillButton>
      )}
      {status ? (
        <p role={status.alert ? "alert" : "status"} className="text-center type-caption text-ink-secondary">
          {status.text}{status.when ? ` ${FUNDING.modal.again(laterText(status.when))}` : ""}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <SlideOver open={open} onOpenChange={(o) => (o || !faucet.busy) && onOpenChange(o)}>
      <SlideOverContent eyebrow={FUNDING.modal.eyebrow} title={testnet ? FUNDING.modal.testnetTitle : FUNDING.modal.mainnetTitle} description={testnet ? undefined : FUNDING.modal.mainnetBody} footer={footer} dismissible={!faucet.busy}>
        {!session.address ? (
          <p className="py-2 text-center type-body text-ink-secondary">{FUNDING.modal.connectFirst}</p>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col items-center gap-2 text-center" aria-label={FUNDING.modal.balance}>
              <span className="type-caption text-ink-secondary">{FUNDING.modal.balance}</span>
              <span className="numbers funds-figure"><Masked>{dollars(sheet?.ok ? sheet.value.spendableBase : null)}</Masked></span>
              {testnet ? <span className="rounded-full bg-surface-2 px-3 py-1 type-caption text-ink-secondary">{FUNDING.modal.tag}</span> : null}
            </section>
            {state.phase === "funded" ? <FundedReceipt address={session.address} txHashes={state.claim.txHashes} atMs={state.atMs} /> : null}
            {bridgeIn ? (
              <Link href="/bridge" className="funds-rail" onClick={() => onOpenChange(false)}>
                {FUNDING.modal.bridge}
              </Link>
            ) : null}
            <footer className="funds-foot">
              <span className="type-caption text-ink-secondary">{FUNDING.modal.account}</span>
              <div className="funds-foot-row">
                <span className="funds-address numbers" title={session.address}>{shortHex(session.address)}</span>
                <PillButton tone="ghost" size="sm" onClick={() => void copy()} aria-label={`${FUNDING.modal.copy} ${session.address}`}>
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  <span aria-live="polite">{copied ? FUNDING.modal.copied : FUNDING.modal.copy}</span>
                </PillButton>
                <PillButton tone="ghost" size="sm" aria-pressed={qr} onClick={() => setQr((v) => !v)}>
                  <QrCode aria-hidden /> {qr ? FUNDING.modal.qrHide : FUNDING.modal.qr}
                </PillButton>
              </div>
              {qr ? <ReceiveQr value={session.address} label={FUNDING.modal.qrLabel} /> : null}
            </footer>
          </div>
        )}
      </SlideOverContent>
    </SlideOver>
  );
}
