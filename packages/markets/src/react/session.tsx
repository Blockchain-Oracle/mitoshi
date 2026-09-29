"use client";

/**
 * The user's signing session (Masayume 68f7a09:packages/markets/src/react/session.tsx, rebuilt on viem): one session
 * per connected account. A new wallet client — connect, account switch, chain switch, disconnect — disposes the old
 * session and builds a new one; nothing is rebound in place, so an in-flight write can never find a different signer.
 * The context values are split (session vs signer state) and memoised so a clock tick never re-renders consumers
 * (ux-audit R3).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account, Chain, Transport, WalletClient } from "viem";
import type { Address } from "@cwf/core";
import { nowSec } from "../runtime/clock";
import { createLocalStorageJournal } from "../submitter/journal-local-storage";
import type { MarketsSubmitter } from "../submitter/create";
import type { IntentEncoder } from "../submitter/encoders";
import { createSubmitterSession, type SignerCaps, type SubmitterSession } from "../sessions/submitter-session";
import type { AuthorityKind } from "../sessions/authority";

const SessionContext = createContext<SubmitterSession | null>(null);

export interface SubmitterSessionProviderProps {
  walletClient: WalletClient<Transport, Chain, Account> | undefined;
  caps: SignerCaps;
  authority: AuthorityKind;
  /** Gate on anything required before signing is safe — the right chain, for example. */
  enabled?: boolean;
  encoders?: readonly IntentEncoder[];
  children: ReactNode;
}

export function SubmitterSessionProvider({ walletClient, caps, authority, enabled = true, encoders, children }: SubmitterSessionProviderProps) {
  const [session, setSession] = useState<SubmitterSession | null>(null);
  useEffect(() => {
    if (!walletClient || !enabled) {
      setSession(null);
      return;
    }
    const next = createSubmitterSession({ authority, client: walletClient, caps, nowSec, journal: createLocalStorageJournal(), ...(encoders ? { encoders } : {}) });
    setSession(next);
    return () => {
      next.dispose();
      setSession(null);
    };
  }, [walletClient, enabled, caps, authority, encoders]);
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
