/**
 * The wallet-mode key as OUR signer (D-047, D-137, D-141): the browser generates a non-extractable WebCrypto P-256 key
 * (the `sessions/session-key.ts` path X20/X21 proved), the passkey root authorises it once (`wallet_authorizeAccessKey`
 * with the key's address — the SDK signs the authorization and keeps no key material), and every tap signs with the key
 * through our own order lane: `tx/send.ts` sends once, never retries, and publishes the authorization with the first
 * send (sponsored, D-136). The accounts SDK's own access-key path is not used for taps: when its access-key fill or send
 * fails it silently falls back to the root (a passkey prompt the user didn't ask for, and after an ambiguous send a
 * second transaction) — measured in the S4 gate (F-S4-15).
 */
import { KeyAuthorization } from "ox/tempo";
import { createPublicClient, createWalletClient, type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { TEMPO } from "@cwf/clients";
import type { Network } from "@cwf/core";
import { tempoChain } from "../chains";
import { tempoTransport } from "../transports";
import { accessKeyAccount, generateSessionKey, type SessionKeyRecord } from "../sessions/session-key";
import { createSubmitterSession, FULL_TEMPO_CAPS, type SubmitterSession } from "../sessions/submitter-session";
import { createLocalStorageJournal } from "../submitter/journal-local-storage";
import type { PendingKeyAuthorization } from "../tx/send";
import { accountKeychainAbi } from "./keychain-abi";

export type WalletKeyRecord = SessionKeyRecord;

/** A fresh non-extractable key for `root` (its address is the TIP-1011 key id). */
export function newWalletKey(root: Address): Promise<WalletKeyRecord> {
  return generateSessionKey(root);
}

/** The key's on-chain state on the AccountKeychain: absent until its first send publishes it. */
export async function walletKeyOnChain(client: PublicClient, root: Address, keyId: Address): Promise<{ published: boolean; revoked: boolean; expirySec: bigint }> {
  // The precompile's own field is `expiry` (seconds); read by name, never renamed on the wire.
  const r = (await client.readContract({ address: TEMPO.accountKeychain as Address, abi: accountKeychainAbi, functionName: "getKey", args: [root, keyId] })) as Record<string, unknown>;
  const expirySec = BigInt((r["expiry"] as bigint | undefined) ?? 0n);
  const revoked = r["isRevoked"] === true;
  return { published: expirySec > 0n || revoked, revoked, expirySec };
}

export interface WalletKeySessionInput {
  record: WalletKeyRecord;
  root: Address;
  network: Network;
  rpcHttpUrls: readonly string[];
  relayUrl: string;
  /** The root-signed authorization in RPC shape (from `wallet_authorizeAccessKey`); null once the chain has the key. */
  authorizationRpc: unknown | null;
  nowSec: () => number;
}

/** The submitter session that signs taps with the wallet key (authority `access-key`), sponsored by the relay. */
export function walletKeySession(input: WalletKeySessionInput): SubmitterSession {
  const account = accessKeyAccount(input.record, input.root);
  const client = createWalletClient({ account, chain: tempoChain(input.network), transport: tempoTransport({ rpcHttpUrls: input.rpcHttpUrls, relayUrl: input.relayUrl }) }) as WalletClient<Transport, Chain, Account>;
  const pending: PendingKeyAuthorization = { current: input.authorizationRpc ? KeyAuthorization.fromRpc(input.authorizationRpc as KeyAuthorization.Rpc) : null };
  return createSubmitterSession({ authority: "access-key", client, caps: FULL_TEMPO_CAPS, nowSec: input.nowSec, journal: createLocalStorageJournal(), pendingKeyAuthorization: pending });
}

/** A read client for the key check (unbatched, the public RPC's rule). */
export function walletKeyReader(network: Network, rpcHttpUrls: readonly string[], relayUrl: string): PublicClient {
  return createPublicClient({ chain: tempoChain(network), transport: tempoTransport({ rpcHttpUrls, relayUrl }) }) as PublicClient;
}

export type { Hex };
