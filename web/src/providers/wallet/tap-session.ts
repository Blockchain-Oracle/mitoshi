"use client";
/**
 * The tap submitters (D-047, D-141; S7). When this device holds an armed wallet key, taps, cash-outs and collects sign
 * with it — no prompt — through our own lane; everything the key may not do (revoking keys, root actions) stays on the
 * passkey session. When the Trading Balance is armed too (S7), a call routed `vault-grant` goes to the session key
 * instead (`routeTaps`); every other write keeps its own signer. Null when nothing is armed.
 */
import type { MarketsSubmitter } from "@cwf/markets";
import { useSubmitter } from "@cwf/markets/react";
import { createContext, useContext } from "react";

export const TapSubmitterContext = createContext<MarketsSubmitter | null>(null);

/** The submitter for a call, a cash-out or a collect: the wallet key when armed, else the account's own session. */
export function useTapSubmitter(): MarketsSubmitter | null {
  const tap = useContext(TapSubmitterContext);
  const user = useSubmitter();
  return tap ?? user;
}

const WALLET_KEY = Symbol("cwf.tap.walletKey");
type Routed = MarketsSubmitter & { [WALLET_KEY]: MarketsSubmitter | null };

/** True when the wallet-mode key is armed on this device (a Trading Balance route alone does not count). */
export function useTapArmed(): boolean {
  const tap = useContext(TapSubmitterContext) as Routed | null;
  if (!tap) return false;
  return WALLET_KEY in tap ? tap[WALLET_KEY] !== null : true;
}

/**
 * One submitter that sends a `vault-grant` call through the Trading Balance's session key and everything else to the
 * wallet key (when armed) or the account's own session. `onVaultTap` sees each confirmed vault call (the optimistic
 * "Spent today", E.5 S7).
 */
export function routeTaps(walletKey: MarketsSubmitter | null, user: MarketsSubmitter, sessionKey: MarketsSubmitter, onVaultTap: (costBase: bigint) => void): MarketsSubmitter {
  const fallback = walletKey ?? user;
  const routed: Routed = {
    ...fallback,
    journal: fallback.journal,
    wallet: fallback.wallet,
    hasSigner: () => true,
    submitTx: (intent, onPhase) => fallback.submitTx(intent, onPhase),
    submitCashOut: (request, onPhase) => fallback.submitCashOut(request, onPhase),
    submitOrder: async (request, onPhase) => {
      if (request.route?.kind !== "vault-grant") return fallback.submitOrder(request, onPhase);
      const outcome = await sessionKey.submitOrder({ ...request, wallet: sessionKey.wallet }, onPhase);
      if (outcome.status === "confirmed") onVaultTap(outcome.booked.costBase);
      return outcome;
    },
    [WALLET_KEY]: walletKey,
  };
  return routed;
}
