"use client";
/**
 * Building a signing session for a wallet client (the heavy half of `session.tsx`: the submitter, encoders and the send
 * module). `@cwf/markets/react-session` — imported only by the lazy wallet runtime and tests, never by page code (§3.1).
 */
import { useEffect, useState, type ReactNode } from "react";
import type { Account, Chain, Transport, WalletClient } from "viem";
import { nowSec } from "../runtime/clock";
import { createLocalStorageJournal } from "../submitter/journal-local-storage";
import type { IntentEncoder } from "../submitter/encoders";
import { createSubmitterSession, type SignerCaps, type SubmitterSession } from "../sessions/submitter-session";
import type { AuthorityKind } from "../sessions/authority";
import { SubmitterSessionValue } from "./session";

export interface SubmitterSessionProviderProps {
  walletClient: WalletClient<Transport, Chain, Account> | undefined;
  caps: SignerCaps;
  authority: AuthorityKind;
  /** Gate on anything required before signing is safe — the right chain, for example. */
  enabled?: boolean;
  encoders?: readonly IntentEncoder[];
  children: ReactNode;
}

export type SubmitterSessionOptions = Omit<SubmitterSessionProviderProps, "children">;

/** Builds (and disposes) the session for a wallet client; for hosts that provide it elsewhere (a lazy wallet runtime). */
export function useSubmitterSessionState({ walletClient, caps, authority, enabled = true, encoders }: SubmitterSessionOptions): SubmitterSession | null {
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
  return session;
}

export function SubmitterSessionProvider({ children, ...options }: SubmitterSessionProviderProps) {
  return <SubmitterSessionValue session={useSubmitterSessionState(options)}>{children}</SubmitterSessionValue>;
}

