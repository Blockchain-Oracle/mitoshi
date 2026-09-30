// Ported from Masayume 68f7a09:web/src/features/session/useKeySession.ts (the session and its cross-tab key lock) —
// the session itself moves here beside the key (only `packages/markets` does chain I/O); the sponsor transport and the
// gas top-up are gone: the relay pays the key's taps under the vault policy (`placeFor` sponsored, D-003).
/**
 * The Trading Balance session key's own signing session (AD-5 SESSION grant): a WebCrypto P-256 account that is the
 * grant's actor — it signs `placeFor` taps as itself, through our order lane (`vault/order.ts`), sent once and never
 * retried (D-137), sponsored by the relay. Its journal is the browser's, so a killed tab is reconciled by `validBefore`
 * on the next session (`vault/recovery.ts`). One key, one writer, even across tabs: every write waits for the
 * browser-wide lock on the key's address (Masayume's rule; E.7 "cross-tab key lock").
 */
import { createWalletClient, type Account, type Chain, type Transport, type WalletClient } from "viem";
import type { Address, Network } from "@cwf/core";
import { tempoChain } from "../chains";
import { tempoTransport } from "../transports";
import { createLocalStorageJournal } from "../submitter/journal-local-storage";
import { sessionKeyAccount, type SessionKeyRecord } from "./session-key";
import { createSubmitterSession, FULL_TEMPO_CAPS, type SubmitterSession } from "./submitter-session";

export interface SessionKeySessionInput {
  record: SessionKeyRecord;
  network: Network;
  rpcHttpUrls: readonly string[];
  relayUrl: string;
  nowSec: () => number;
}

/** Runs `task` holding the browser-wide lock for `key` (a no-op where the Web Locks API is missing, e.g. Node). */
export function withKeyLock<T>(key: Address, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as { locks?: LockManager }).locks : undefined;
  if (!locks) return task();
  return locks.request(`cwf.sessionKey.${key.toLowerCase()}`, task) as Promise<T>;
}

function serialised(session: SubmitterSession): SubmitterSession {
  const { submitter } = session;
  return {
    authority: session.authority,
    address: session.address,
    chainId: session.chainId,
    caps: session.caps,
    get disposed() {
      return session.disposed;
    },
    dispose: () => session.dispose(),
    submitter: {
      ...submitter,
      submitOrder: (request, onPhase) => withKeyLock(session.address, () => submitter.submitOrder(request, onPhase)),
      submitTx: (intent, onPhase) => withKeyLock(session.address, () => submitter.submitTx(intent, onPhase)),
      submitCashOut: (request, onPhase) => withKeyLock(session.address, () => submitter.submitCashOut(request, onPhase)),
    },
  };
}

/** The session key's signing session (authority `session-key`), relay-sponsored, one writer across tabs. */
export function sessionKeySession(input: SessionKeySessionInput): SubmitterSession {
  const account = sessionKeyAccount(input.record);
  const client = createWalletClient({ account, chain: tempoChain(input.network), transport: tempoTransport({ rpcHttpUrls: input.rpcHttpUrls, relayUrl: input.relayUrl }) }) as WalletClient<Transport, Chain, Account>;
  return serialised(createSubmitterSession({ authority: "session-key", client, caps: FULL_TEMPO_CAPS, nowSec: input.nowSec, journal: createLocalStorageJournal() }));
}
