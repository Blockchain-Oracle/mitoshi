/**
 * Sends a root-signed Tempo tx carrying a tx-level `key_authorization` (plan B.4.3's "one root-signed tx
 * key_authorization + follow"). `cast` can't attach a key authorization, so this one flow signs with viem: the root
 * signs the authorization digest (`signKeyAuthorization`), then signs the tx that carries it. With a passkey root that
 * is two WebAuthn prompts — spike X4 measures it against the one-prompt shape (`authorizeKey` as a batch call).
 * The one send module (invariant write-boundary); scripts import it, keys never leave the caller's process.
 * Docs: viem `viem/tempo` Account.fromSecp256k1 + signKeyAuthorization, sendTransactionSync `calls`/`keyAuthorization`/
 * `feeToken` (viem site tempo/accounts/account.fromSecp256k1, tempo/guides/batch-calls).
 */
import { type Address, type Hex, type TransactionReceipt, http } from "viem";
import { tempo, tempoModerato } from "viem/chains";
import { Account, Addresses, createClient } from "viem/tempo";
import type { themeKeyAuthorization } from "../themes/keyAuth";

export interface AuthorizeAndCallInput {
  rootPrivateKey: Hex;
  keyId: Address;
  authorization: ReturnType<typeof themeKeyAuthorization>;
  calls: readonly { to: Address; data: Hex }[];
  rpcUrl?: string;
  gas?: bigint;
}

/** Root-signed tx: `key_authorization` (signed by the same root) + `calls`. Returns the mined receipt. */
export async function sendRootWithKeyAuthorization(p: AuthorizeAndCallInput): Promise<TransactionReceipt> {
  const root = Account.fromSecp256k1(p.rootPrivateKey);
  const client = createClient({ account: root, chain: tempoModerato, feeToken: Addresses.pathUsd, transport: http(p.rpcUrl ?? "https://rpc.moderato.tempo.xyz") });
  const keyAuthorization = await root.signKeyAuthorization({ accessKeyAddress: p.keyId, keyType: "secp256k1" } as never, { chainId: tempoModerato.id, ...p.authorization } as never);
  return (await client.sendTransactionSync({ calls: p.calls, keyAuthorization, ...(p.gas ? { gas: p.gas } : {}) } as never)) as TransactionReceipt;
}

export interface RootCallsInput {
  privateKey: Hex;
  calls: readonly { to: Address; data: Hex }[];
  network: "testnet" | "mainnet";
  rpcUrl?: string;
  gas?: bigint;
}

/**
 * An ops role key (secp256k1 root) sends one Tempo batch (0x76) paying fees in pathUSD and waits for the receipt — used
 * by server actors (S15b `reference-writer`). The key stays in the caller's process; nothing is logged here.
 */
export async function sendRootCalls(p: RootCallsInput): Promise<TransactionReceipt> {
  const account = Account.fromSecp256k1(p.privateKey);
  const chain = p.network === "mainnet" ? tempo : tempoModerato;
  const client = createClient({ account, chain, feeToken: Addresses.pathUsd, transport: http(p.rpcUrl) });
  return (await client.sendTransactionSync({ calls: p.calls, ...(p.gas ? { gas: p.gas } : {}) } as never)) as TransactionReceipt;
}
