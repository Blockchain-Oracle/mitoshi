"use client";
/**
 * One claim of test dollars, as a small state machine the onboarding step and the Add money dialog share. Passkey
 * accounts claim with their session (no prompt, D-046); wallets sign the one-time challenge. A funded claim refetches
 * the balance sheet and fires the first-credit welcome.
 */
import { invalidateAfterWrite } from "@cwf/markets/react";
import type { Address, Hex } from "@cwf/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import type { FaucetErrorCode } from "./copy";
import { announceCredit } from "./credited";
import { claimWithSession, claimWithSignature, type FundedClaim } from "./faucet-client";

export type ClaimState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "funding" }
  | { phase: "funded"; claim: FundedClaim; atMs: number }
  | { phase: "failed"; code: FaucetErrorCode; nextClaimAtMs: number | null };

export function useFaucetClaim(input: { address: Address | null; viaSession: boolean }) {
  const [state, setState] = useState<ClaimState>({ phase: "idle" });
  const queryClient = useQueryClient();
  const { signMessage } = useWalletShell();
  const { address, viaSession } = input;

  const claim = useCallback(async (): Promise<ClaimState> => {
    if (!address) return state;
    let next: ClaimState;
    try {
      if (viaSession) {
        setState({ phase: "funding" });
        const result = await claimWithSession();
        next = result.ok ? { phase: "funded", claim: result.claim, atMs: Date.now() } : { phase: "failed", code: result.code, nextClaimAtMs: result.nextClaimAtMs };
      } else {
        setState({ phase: "signing" });
        const result = await claimWithSignature(address, async (message) => {
          const signature: Hex = await signMessage(message);
          setState({ phase: "funding" });
          return signature;
        });
        next = result.ok ? { phase: "funded", claim: result.claim, atMs: Date.now() } : { phase: "failed", code: result.code, nextClaimAtMs: result.nextClaimAtMs };
      }
    } catch (error) {
      const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      next = { phase: "failed", code: /rejected|denied|NotAllowedError|cancel/i.test(text) ? "rejected" : "unknown", nextClaimAtMs: null };
    }
    setState(next);
    if (next.phase === "funded") {
      announceCredit(address);
      void invalidateAfterWrite(queryClient, { wallet: address });
    }
    return next;
  }, [address, viaSession, queryClient, signMessage, state]);

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, claim, reset, busy: state.phase === "signing" || state.phase === "funding" };
}
