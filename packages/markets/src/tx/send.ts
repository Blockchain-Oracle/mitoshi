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
import { tempoModerato } from "viem/chains";
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
