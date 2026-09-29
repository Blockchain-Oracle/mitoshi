/**
 * One account, one chain, one authority, one writer (Masayume 68f7a09:packages/markets/src/sessions/submitter-session.ts,
 * rebuilt on viem/Tempo). The session takes a wallet client already bound to its signer — a wagmi connector client for
 * passkeys and injected wallets, a local account for keys and ops — and never swaps it. Disposal is required on
 * disconnect, account switch, chain switch, grant expiry or revocation.
 */
import type { Account, Chain, Transport, WalletClient } from "viem";
import type { Address, IntentJournal } from "@cwf/core";
import { createSubmitter, type MarketsSubmitter } from "../submitter/create";
import type { IntentEncoder } from "../submitter/encoders";
import type { NoncePlan } from "../tx/nonce";
import type { AuthorityKind } from "./authority";
import { createNonceQueue } from "./nonce-queue";

/**
 * What a signer can do on Tempo, declared by its connector (so SM3's `shellDevice` connector can declare full caps).
 * Injected secp256k1 wallets can't sign 0x76 transactions: no `calls[]`, no fee payer, no inline key authorization.
 */
export interface SignerCaps {
  batch: boolean;
  sponsor: boolean;
  keyAuthorization: boolean;
}

export const FULL_TEMPO_CAPS: SignerCaps = { batch: true, sponsor: true, keyAuthorization: true };
export const INJECTED_CAPS: SignerCaps = { batch: false, sponsor: false, keyAuthorization: false };

export interface SubmitterSessionConfig {
  authority: AuthorityKind;
  client: WalletClient<Transport, Chain, Account>;
  caps: SignerCaps;
  nowSec: () => number;
  journal?: IntentJournal;
  encoders?: readonly IntentEncoder[];
  nonce?: NoncePlan;
}

export interface SubmitterSession {
  readonly authority: AuthorityKind;
  readonly address: Address;
  readonly chainId: number;
  readonly caps: SignerCaps;
  readonly submitter: MarketsSubmitter;
  readonly disposed: boolean;
  dispose(): void;
}

export class SessionDisposedError extends Error {
  constructor(authority: AuthorityKind) {
    super(`the ${authority} session has been disposed; construct a new one to sign again`);
    this.name = "SessionDisposedError";
  }
}

export function createSubmitterSession(config: SubmitterSessionConfig): SubmitterSession {
  const address = config.client.account.address as Address;
  let disposed = false;
  const queue = createNonceQueue();
  const enqueue = <T>(task: () => Promise<T>) => queue(() => (disposed ? Promise.reject(new SessionDisposedError(config.authority)) : task()));
  const inner = createSubmitter({
    client: config.client, wallet: address, enqueue, canSponsor: config.caps.sponsor, nowSec: config.nowSec,
    ...(config.journal ? { journal: config.journal } : {}),
    ...(config.encoders ? { encoders: config.encoders } : {}),
    ...(config.nonce ? { nonce: config.nonce } : {}),
  });
  const guard = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => (...args: A): Promise<R> =>
    disposed ? Promise.reject(new SessionDisposedError(config.authority)) : fn(...args);
  const submitter: MarketsSubmitter = { ...inner, submitTx: guard(inner.submitTx), submitOrder: guard(inner.submitOrder) };
  return {
    authority: config.authority,
    address,
    chainId: config.client.chain.id,
    caps: config.caps,
    submitter,
    get disposed() {
      return disposed;
    },
    dispose() {
      disposed = true;
    },
  };
}
