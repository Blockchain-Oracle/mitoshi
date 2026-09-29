/**
 * Live-drive support for wallet mode (D-047; spikes X20/X21; not bundled by the app). A passkey-shaped root
 * (`Account.fromHeadlessWebAuthn`: the same P-256 WebAuthn envelope a real passkey signs) and a browser-shaped access
 * key (`WebCryptoP256.createKeyPair({ extractable: false })` → `Account.fromWebCryptoP256(…, { access: root })`, the
 * exact `sessions/session-key.ts` path), each bound to a wallet client whose transport routes sponsorship to a relay
 * (`withRelay`). Lives here because only `@cwf/markets` may import `viem/tempo` (chain-io boundary); every send still
 * goes through `tx/send.ts` via the submitter sessions.
 */
import { P256 } from "ox";
import { createWalletClient, type Account, type Address, type Chain, type Hex, type Transport, type WalletClient } from "viem";
import { Account as TempoAccount } from "viem/tempo";
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
}

/** A fresh passkey-shaped root; the P-256 secret stays in this process. */
export function newPasskeyRoot(): PasskeyRoot {
  const account = TempoAccount.fromHeadlessWebAuthn(P256.randomPrivateKey() as Hex, DRIVE_WEBAUTHN);
  return { account, address: account.address as Address };
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
