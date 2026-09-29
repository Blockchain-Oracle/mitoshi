/**
 * The ONE module that sends a Tempo transaction (`write-boundary` invariant; plan C.2.3). Every send:
 * - carries its calls as one atomic batch (`calls[]`),
 * - names pathUSD as the fee token (N-12) and an explicit priority fee,
 * - asks our relay to pay (`feePayer: true`, routed by `withRelay`) when the area policy covers it,
 * - sets its nonce explicitly (expiring for keys and taps, X21),
 * - waits for the receipt in the same round trip (`sendTransactionSync`, ~0.5 s finality).
 *
 * Plus (S16c.3, X4) `sendRootWithKeyAuthorization`: a root-signed tx carrying a tx-level `key_authorization`. Scripts
 * import it; keys never leave the caller's process. Docs: viem `viem/tempo` Account.fromSecp256k1 +
 * signKeyAuthorization, sendTransactionSync `calls`/`keyAuthorization`/`feeToken` (viem site
 * tempo/accounts/account.fromSecp256k1, tempo/guides/batch-calls).
 */
import { type Account, type Address, type Chain, type Hex, type TransactionReceipt, type Transport, type WalletClient, http } from "viem";
import type { themeKeyAuthorization } from "../themes/keyAuth";
import type { Call } from "./batch";
import { FEE_TOKEN, PRIORITY_FEE_PER_GAS } from "./fee";
import { nonceFields, type NoncePlan, type NonceFields } from "./nonce";

export interface SendRequest {
  calls: readonly Call[];
  /** Ask the relay to pay the fee. */
  sponsored: boolean;
  nonce: NoncePlan;
  /** Chain-corrected now, for `validBefore`. */
  nowSec: number;
}

export interface SendResult {
  receipt: TransactionReceipt;
  hash: Hex;
  fields: NonceFields;
}

/** The request we hand viem, exposed so tests and the journal can see exactly what is signed. */
export function buildSendParameters(request: SendRequest) {
  if (request.calls.length === 0) throw new Error("a send needs at least one call");
  if (request.calls.some((c) => c.value && c.value !== 0n)) throw new Error("Tempo sends carry no native value");
  const fields = nonceFields(request.nonce, request.nowSec);
  return {
    fields,
    parameters: {
      calls: request.calls.map((c) => ({ to: c.to, data: c.data })),
      feeToken: FEE_TOKEN,
      ...fields,
      // A sponsored send leaves every fee field to the sponsor's fill: Moderato's `eth_fillTransaction` with
      // `feePayer: true` and an explicit fee field estimates against the SENDER's balance and answers "gas required
      // exceeds allowance (0)" (measured 2026-09-29). The relay policy bounds what the sponsor pays via the gas cap.
      ...(request.sponsored ? { feePayer: true as const } : { maxPriorityFeePerGas: PRIORITY_FEE_PER_GAS }),
    },
  };
}

/**
 * Signs and sends through the session's wallet client, returning the receipt. `onSubmitted` fires once the signature
 * exists and before the receipt, so the journal can record "sent" (a hash is known only after inclusion with sync
 * sends; the journal records by expiry instead, L-08).
 */
export async function sendBatch<chain extends Chain>(
  client: WalletClient<Transport, chain, Account>,
  request: SendRequest,
): Promise<SendResult> {
  const { parameters, fields } = buildSendParameters(request);
  // The Tempo chain config types the extra fields (`calls`, `feeToken`, `nonceKey`, `validBefore`, `feePayer`).
  const signed = { ...parameters, account: client.account, chain: client.chain };
  const receipt = (await client.sendTransactionSync(signed as never)) as TransactionReceipt;
  return { receipt, hash: receipt.transactionHash, fields };
}

export interface AuthorizeAndCallInput {
  rootPrivateKey: Hex;
  keyId: Address;
  authorization: ReturnType<typeof themeKeyAuthorization>;
  calls: readonly { to: Address; data: Hex }[];
  rpcUrl?: string;
  gas?: bigint;
}

/**
 * Sends a root-signed Tempo tx carrying a tx-level `key_authorization` (plan B.4.3's "one root-signed tx
 * key_authorization + follow"). `cast` can't attach a key authorization, so this one flow signs with viem: the root
 * signs the authorization digest (`signKeyAuthorization`), then signs the tx that carries it. With a passkey root that
 * is two WebAuthn prompts — spike X4 measures it against the one-prompt shape (`authorizeKey` as a batch call).
 * `viem/tempo` and the chain load on use, so page code importing this module does not pull them in (S1 perf, D-071).
 */
export async function sendRootWithKeyAuthorization(p: AuthorizeAndCallInput): Promise<TransactionReceipt> {
  const [{ Account: TempoAccount, Addresses, createClient }, { tempoModerato }] = await Promise.all([import("viem/tempo"), import("viem/chains")]);
  const root = TempoAccount.fromSecp256k1(p.rootPrivateKey);
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
 * `viem/tempo` and the chains load on use, like `sendRootWithKeyAuthorization` (S1 perf, D-071).
 */
export async function sendRootCalls(p: RootCallsInput): Promise<TransactionReceipt> {
  const [{ Account: TempoAccount, Addresses, createClient }, { tempo, tempoModerato }] = await Promise.all([import("viem/tempo"), import("viem/chains")]);
  const account = TempoAccount.fromSecp256k1(p.privateKey);
  const chain = p.network === "mainnet" ? tempo : tempoModerato;
  const client = createClient({ account, chain, feeToken: Addresses.pathUsd, transport: http(p.rpcUrl) });
  return (await client.sendTransactionSync({ calls: p.calls, ...(p.gas ? { gas: p.gas } : {}) } as never)) as TransactionReceipt;
}
