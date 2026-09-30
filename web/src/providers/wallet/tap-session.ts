"use client";
/**
 * The wallet-key session (D-047, D-141): when this device holds an armed wallet key for the signed-in account, taps,
 * cash-outs and collects sign with it — no prompt — through our own lane; everything the key may not do (revoking keys,
 * root actions) stays on the passkey session. Null when no key is armed.
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

export function useTapArmed(): boolean {
  return useContext(TapSubmitterContext) !== null;
}
