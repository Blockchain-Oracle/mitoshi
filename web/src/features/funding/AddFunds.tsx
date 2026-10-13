"use client";
// Add money as Owarine 90a91d71 `features/funding/AddFunds.tsx` (D-224; Abu, 8 Oct: "too much slop text, not supposed
// to be this long"): the account's dollars as one big figure tagged "no cash value", one button (the faucet, or Trade
// once funded), a one-line status only when something needs doing, and the address in a quiet foot. A passkey needs no
// signature; a wallet signs a free message. Mainnet has no faucet: the address is the way in (L-26). Loaded on first open.
import { useBalanceSheet } from "@cwf/markets/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { dollars } from "@/providers/wallet/format";
import { FUNDING } from "./copy";
import { suppressWelcome } from "./credited";
import { faucetAvailability } from "./faucet-client";
import { FundedReceipt } from "./FundedReceipt";
import { useFaucetClaim } from "./useFaucetClaim";
import { SheetFooter } from "@/components/ui/overlay-footer";

const cta = "inline-flex h-(--ticket-cta-height) w-full items-center justify-center gap-2 rounded-md bg-accent-fill px-5 type-body-strong text-on-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-secondary";
const quiet = "inline-flex h-(--ticket-cta-height) w-full items-center justify-center gap-2 rounded-md border border-border-strong px-5 type-body-strong text-ink";

export function laterText(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export default function AddFunds({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const testnet = webEnv.markets.network === "testnet";
  const faucet = useFaucetClaim({ address: session.address, viaSession: session.kind === "passkey" });
  const [copied, setCopied] = useState(false);
  const { state } = faucet;
  // Known refusals (the daily cooldown, a held region) are read up front, so the dialog never offers a button that fails.
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

  return (
    <Modal open={open} onOpenChange={onOpenChange} dismissible={!faucet.busy} eyebrow={FUNDING.modal.eyebrow} title={testnet ? FUNDING.modal.testnetTitle : FUNDING.modal.mainnetTitle} description={testnet ? undefined : FUNDING.modal.mainnetBody}>
      {!session.address ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <p className="type-body text-ink-secondary">{FUNDING.modal.connectFirst}</p>
          <button type="button" className={cta} onClick={() => { onOpenChange(false); session.connect(); }}>{FUNDING.modal.signIn}</button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col items-center gap-2 text-center" aria-label={FUNDING.modal.balance}>
            <span className="type-caption text-ink-secondary">{FUNDING.modal.balance}</span>
            <span className="numbers type-figure text-ink">{dollars(sheet?.ok ? sheet.value.spendableBase : null)}</span>
            {testnet ? <span className="rounded-full bg-surface-2 px-3 py-1 type-caption text-ink-secondary">{FUNDING.modal.tag}</span> : null}
          </section>

          {testnet ? (
            <div className="flex flex-col gap-2">
              <SheetFooter>
              {state.phase === "funded" ? (
                <Link href="/trade/BTC" onClick={() => onOpenChange(false)} className={quiet}>{FUNDING.modal.trade} <ArrowRight aria-hidden className="size-4" /></Link>
              ) : (
                <button type="button" className={cta} disabled={faucet.busy || blocked !== null || availability.isPending} onClick={() => void faucet.claim()} aria-busy={faucet.busy}>
                  {faucet.busy ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                  {state.phase === "signing" ? FUNDING.modal.signing : state.phase === "funding" ? FUNDING.modal.funding : FUNDING.modal.request}
                </button>
              )}
              {status ? (
                <p role={status.alert ? "alert" : "status"} className="text-center type-caption text-ink-secondary">
                  {status.text}{status.when ? ` ${FUNDING.modal.again(laterText(status.when))}` : ""}
                </p>
              ) : null}
              </SheetFooter>
              {state.phase === "funded" ? <FundedReceipt address={session.address} txHashes={state.claim.txHashes} atMs={state.atMs} /> : null}
            </div>
          ) : null}

          <footer className="flex flex-col gap-1 border-t border-hairline pt-4">
            <span className="type-caption text-ink-secondary">{FUNDING.modal.account}</span>
            <button type="button" onClick={() => void copy()} className="flex min-h-touch items-center justify-between gap-2 rounded-md border border-hairline bg-surface-1 px-3 text-left" aria-label={`${FUNDING.modal.copy} ${session.address}`}>
              <span className="numbers min-w-0 truncate type-caption text-ink">{session.address}</span>
              <span className="flex shrink-0 items-center gap-1 type-caption text-ink-secondary" aria-live="polite">
                {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                {copied ? FUNDING.modal.copied : FUNDING.modal.copy}
              </span>
            </button>
          </footer>
        </div>
      )}
    </Modal>
  );
}
