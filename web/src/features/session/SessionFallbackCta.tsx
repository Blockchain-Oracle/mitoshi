"use client";
/**
 * The ticket's CTA while tap-trading is armed but cannot take this call (E.5 S7: "the fallback reason always rendered on
 * the CTA"): its label IS the reason, and when there is a one-step fix the CTA runs it ("Budget used — add $25" → one
 * passkey confirmation that adds to the budget; "expired — renew"). Below it, paying from the wallet instead is a
 * separate, labelled choice that says whether it will prompt. Nothing is ever sent from here without the user's tap on
 * words that describe it.
 */
import type { TxState } from "@cwf/core";
import { TxCta } from "@/components/tx";
import { SESSION } from "./copy";
import type { TicketRoute } from "./useTicketRoute";
import { useSessionWrites } from "./useSessionWrites";

export function SessionFallbackCta({ route, walletKeyArmed, tone }: { route: TicketRoute; walletKeyArmed: boolean; tone: "accent" | "up" | "down" }) {
  const w = useSessionWrites();
  const fallback = route.fallback;
  if (!fallback) return null;
  const run = fallback.fix === "add-budget" ? w.addBudget : fallback.fix === "renew" ? () => w.extend() : null;
  const state: TxState = run ? (w.tx.state.kind === "failed" || w.tx.state.kind === "confirmed" ? { kind: "idle" } : w.tx.state) : { kind: "blocked", reason: fallback.reason };
  return (
    <div className="flex flex-col gap-1.5">
      <TxCta state={state} action={fallback.reason} signer="passkey" onConfirm={() => run && void run()} tone={tone} />
      <button type="button" onClick={route.payFromWallet} className="min-h-touch self-center px-3 type-caption text-ink underline decoration-dotted underline-offset-4">
        {SESSION.fallback.payFromWallet} · {walletKeyArmed ? SESSION.fallback.walletNoPrompt : SESSION.fallback.walletPrompt}
      </button>
    </div>
  );
}
