/**
 * Live-drive support for wallet mode (D-047; spikes X20/X21; not bundled by the app). A passkey-shaped root
 * (`Account.fromHeadlessWebAuthn`: the same P-256 WebAuthn envelope a real passkey signs) and a browser-shaped access
 * key (`WebCryptoP256.createKeyPair({ extractable: false })` → `Account.fromWebCryptoP256(…, { access: root })`, the
 * exact `sessions/session-key.ts` path), each bound to a wallet client whose transport routes sponsorship to a relay
 * (`withRelay`). Lives here because only `@cwf/markets` may import `viem/tempo` (chain-io boundary); every send still
 * goes through `tx/send.ts` via the submitter sessions.
 */
import { P256 } from "ox";
import { createWalletClient, decodeEventLog, encodeFunctionData, type Account, type Address, type Chain, type Hex, type Transport, type WalletClient } from "viem";
import { Abis, Account as TempoAccount, Addresses } from "viem/tempo";
import { TEMPO_RPC_HTTP } from "@cwf/core";
import { tempoChain } from "../chains";
import { tempoTransport } from "../transports";
import { accessKeyAccount, generateSessionKey, type SessionKeyRecord } from "../sessions/session-key";
import type { WalletKeyAuthorization } from "../keys/wallet-key";

export const DRIVE_WEBAUTHN = { rpId: "testnet.mitoshi.xyz", origin: "https://testnet.mitoshi.xyz" } as const;

export type DriveClient = WalletClient<Transport, Chain, Account>;

export interface PasskeyRoot {
  account: ReturnType<typeof TempoAccount.fromHeadlessWebAuthn>;
  address: Address;
  /** The P-256 secret, for a drive that resumes across phases (kept in a 0600 file, never printed). */
  secret: Hex;
}

/** A passkey-shaped root: fresh, or restored from its secret. */
export function newPasskeyRoot(secret: Hex = P256.randomPrivateKey() as Hex): PasskeyRoot {
  const account = TempoAccount.fromHeadlessWebAuthn(secret, DRIVE_WEBAUTHN);
  return { account, address: account.address as Address, secret };
}

export function driveClient(account: Account, relayUrl: string, rpcUrl: string = TEMPO_RPC_HTTP.testnet): DriveClient {
  return createWalletClient({ account, chain: tempoChain("testnet"), transport: tempoTransport({ rpcHttpUrls: [rpcUrl], relayUrl, batch: false }) }) as DriveClient;
}

export interface WalletModeKey {
  record: SessionKeyRecord;
  account: ReturnType<typeof accessKeyAccount>;
  keyId: Address;
}

/** A non-extractable WebCrypto P-256 access key of `root` (wallet mode). */
export async function newWalletModeKey(root: Address): Promise<WalletModeKey> {
  const record = await generateSessionKey(root);
  const account = accessKeyAccount(record, root);
  return { record, account, keyId: record.address };
}

/** The root signs the key's authorization (the sign-in ceremony's `accessKey.authorize`); published with the key's first send. */
export async function signWalletKeyAuthorization(root: PasskeyRoot, key: WalletModeKey, auth: WalletKeyAuthorization): Promise<unknown> {
  return root.account.signKeyAuthorization(key.account as never, { ...auth, chainId: tempoChain("testnet").id } as never);
}

/** TIP-403 `PolicyType.BLACKLIST` (the spec's enum: WHITELIST 0, BLACKLIST 1); policy 1 is the built-in always-allow. */
export const POLICY_BLACKLIST = 1;
export const POLICY_ALWAYS_ALLOW = 1n;

/**
 * Drive-only TIP-403 calls for the held-by-receive-policy proof (N-13): a blacklist naming `sender` owned by the
 * account, and the account's receive policy pointing at it (token filter always-allow, recovery = the account).
 * Docs: tempo.xyz protocol/tip403/spec + receive-policies (TIP-1028).
 */
export const receivePolicyCalls = {
  createBlacklist: (admin: Address, blocked: Address) => ({ to: Addresses.tip403Registry as Address, data: encodeFunctionData({ abi: Abis.tip403Registry, functionName: "createPolicyWithAccounts", args: [admin, POLICY_BLACKLIST, [blocked]] }) }),
  setReceivePolicy: (senderPolicyId: bigint, recovery: Address) => ({ to: Addresses.tip403Registry as Address, data: encodeFunctionData({ abi: Abis.tip403Registry, functionName: "setReceivePolicy", args: [senderPolicyId, POLICY_ALWAYS_ALLOW, recovery] }) }),
  unblock: (policyId: bigint, account: Address) => ({ to: Addresses.tip403Registry as Address, data: encodeFunctionData({ abi: Abis.tip403Registry, functionName: "modifyPolicyBlacklist", args: [policyId, account, false] }) }),
};

/** The policy id a `createPolicyWithAccounts` receipt created (its `PolicyCreated` log). */
export function createdPolicyId(logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[]): bigint | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== (Addresses.tip403Registry as string).toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: Abis.tip403Registry, data: log.data, topics: log.topics as never });
      if (ev.eventName === "PolicyCreated") return (ev.args as { policyId: bigint }).policyId;
    } catch {
      continue;
    }
  }
  return null;
}
