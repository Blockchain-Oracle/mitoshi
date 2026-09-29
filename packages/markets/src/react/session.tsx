"use client";

/**
 * The user's signing session (Masayume 68f7a09:packages/markets/src/react/session.tsx, rebuilt on viem): one session
 * per connected account. A new wallet client — connect, account switch, chain switch, disconnect — disposes the old
 * session and builds a new one; nothing is rebound in place, so an in-flight write can never find a different signer.
 * The context values are split (session vs signer state) and memoised so a clock tick never re-renders consumers
 * (ux-audit R3). This module is the light half (context + hooks, in every page's first load); building a session
 * (submitter, encoders, send → viem/tempo) lives in `session-builder.tsx`, imported only by the lazy wallet runtime (§3.1).
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Address } from "@cwf/core";
import type { MarketsSubmitter } from "../submitter/create";
import type { SubmitterSession } from "../sessions/submitter-session";

const SessionContext = createContext<SubmitterSession | null>(null);

/** Provides a session built elsewhere (`@cwf/markets/react-session`'s `useSubmitterSessionState`, in the lazy wallet runtime). */
export function SubmitterSessionValue({ session, children }: { session: SubmitterSession | null; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The active signing session, or null when nothing can sign. */
export function useUserSession(): SubmitterSession | null {
  return useContext(SessionContext);
}

export function useSubmitter(): MarketsSubmitter | null {
  return useUserSession()?.submitter ?? null;
}

export interface SignerState {
  address: Address | null;
  hasSigner: boolean;
}

/** The account that will actually sign — the session's, not wagmi's; they differ while a session is being built. */
export function useSigner(): SignerState {
  const session = useUserSession();
  return useMemo(() => ({ address: session?.address ?? null, hasSigner: session !== null }), [session]);
}
