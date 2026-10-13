"use client";
/**
 * The arm step (D-046 slot; D-047 key): Masayume's one-sentence arm grammar — lead, facts, "no fees", the skip line, one
 * primary action — inside whichever centred modal hosts it (the sign-up ceremony, or the ticket's tap-trading chip).
 * One passkey prompt authorises the key; nothing moves and nothing is charged. Failure says so and changes nothing.
 */
import { formatBaseUnits } from "@cwf/core/units";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { walletKeyTerms } from "@/providers/wallet/access-key";
import { TAP } from "./copy";
import { SheetFooter } from "@/components/ui/drawer";

const primary = "inline-flex h-(--ticket-cta-height) w-full items-center justify-center gap-2 rounded-md bg-accent-fill px-5 type-body-strong text-on-accent disabled:opacity-60";

export const dollars = (base: bigint) => `$${formatBaseUnits(base, 6, { maxDp: 2 })}`;
export const untilText = (expirySec: number) => new Date(expirySec * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** `onDone` is kept for the arm-slot contract; the host's own way on (Go to Markets, Close) is the skip. */
export function ArmWalletKey(_props: { onDone: () => void }) {
  const shell = useWalletShell();
  const [phase, setPhase] = useState<"idle" | "busy" | "failed" | "aborted">("idle");
  const terms = walletKeyTerms();
  if (!shell.canArmWalletKey || !terms) return null;
  const limit = dollars(terms.limits[0]!.limit);
  const hours = Math.round((terms.expiry - Math.floor(Date.now() / 1000)) / 3600);

  if (shell.walletKey) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 p-3" role="status">
        <p className="flex items-center gap-2 type-body-strong text-ink"><Check aria-hidden className="size-4 text-accent" />{TAP.armed}</p>
        <p className="type-caption text-ink-secondary">{TAP.armedBody(dollars(shell.walletKey.limitBase), untilText(shell.walletKey.expirySec))}</p>
        <Link href="/settings/account" className="min-h-touch self-start py-2 type-caption text-ink underline">{TAP.manage}</Link>
      </div>
    );
  }

  const arm = async () => {
    setPhase("busy");
    const result = await shell.armWalletKey();
    if (result.ok) {
      setPhase("idle");
      return;
    }
    setPhase(result.aborted ? "aborted" : "failed");
  };

  return (
    <section aria-labelledby="arm-wallet-key" className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-2 p-3">
      <p className="type-label-micro text-ink-secondary">{TAP.eyebrow}</p>
      <h3 id="arm-wallet-key" className="type-body-strong text-ink">{TAP.lead}</h3>
      <p className="type-caption text-ink-secondary">{TAP.facts(limit, hours)}</p>
      <p className="type-caption text-ink-secondary">{TAP.sponsored}</p>
      {phase === "failed" || phase === "aborted" ? <p role="alert" className="type-caption text-ink">{phase === "failed" ? TAP.failed : TAP.aborted}</p> : null}
      <SheetFooter>
        <button type="button" className={primary} disabled={phase === "busy"} aria-busy={phase === "busy"} onClick={() => void arm()}>
          {phase === "busy" ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
          {phase === "busy" ? TAP.busy : phase === "idle" ? TAP.cta : TAP.retry}
        </button>
      </SheetFooter>
      <p className="type-caption text-ink-secondary">{TAP.skip}</p>
    </section>
  );
}
