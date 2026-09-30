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
import { type Account, type Address, type Chain, type Hex, type TransactionReceipt, type Transport, type WalletClient, http, keccak256 } from "viem";
import { getBlock, getTransactionReceipt, prepareTransactionRequest, sendRawTransactionSync } from "viem/actions";
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
  /**
   * A root-signed TIP-1011 key authorization to publish with this transaction (the access key signs the tx itself):
   * the wallet-mode key's first tap (D-047). The browser's accounts SDK attaches its pending authorization on its own;
   * scripts and the app shell pass it here.
   */
  keyAuthorization?: unknown;
}

/**
 * A pending key authorization (D-047): published with the next send and cleared once a receipt lands, so a send that
 * never went out keeps it for the next tap.
 */
export interface PendingKeyAuthorization {
  current: unknown | null;
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
      ...(request.keyAuthorization ? { keyAuthorization: request.keyAuthorization } : {}),
      // A sponsored send leaves every fee field to the sponsor's fill: Moderato's `eth_fillTransaction` with
      // `feePayer: true` and an explicit fee field estimates against the SENDER's balance and answers "gas required
      // exceeds allowance (0)" (measured 2026-09-29). The relay policy bounds what the sponsor pays via the gas cap.
      ...(request.sponsored ? { feePayer: true as const } : { maxPriorityFeePerGas: PRIORITY_FEE_PER_GAS }),
    },
  };
}

export interface SendHooks {
  /**
   * The transaction is signed and its bytes are final (the relay's fill already carries the fee payer's signature):
   * called with its hash just before the one sync send, so a surface can show the write as confirmed-pending (D43,
   * D-150) while the chain includes it. Only a local signer (our wallet key, a script's key) splits the send this way.
   */
  onSigned?: (hash: Hex | null) => void;
}

/**
 * Signs and sends through the session's wallet client, returning the receipt. With `hooks.onSigned` and a local
 * account the send runs viem's own `sendTransactionSync` steps in the open (`prepareTransactionRequest` → the account
 * signs → the chain's envelope → `sendRawTransactionSync`, viem site docs/actions/wallet/sendRawTransactionSync) so the
 * hash is known before the receipt; otherwise one `sendTransactionSync`. Either way the transaction is sent once.
 */
export async function sendBatch<chain extends Chain>(
  client: WalletClient<Transport, chain, Account>,
  request: SendRequest,
  hooks: SendHooks = {},
): Promise<SendResult> {
  const { parameters, fields } = buildSendParameters(request);
  // The Tempo chain config types the extra fields (`calls`, `feeToken`, `nonceKey`, `validBefore`, `feePayer`).
  const signed = { ...parameters, account: client.account, chain: client.chain };
  try {
    if (hooks.onSigned && client.account.type === "local") return { ...(await sendSplit(client, signed, hooks.onSigned)), fields };
    const receipt = (await client.sendTransactionSync(signed as never)) as TransactionReceipt;
    return { receipt, hash: receipt.transactionHash, fields };
  } catch (error) {
    const raw = rawOfFailedSend(error);
    if (!raw || fields.validBefore === undefined) throw error;
    // The gateway answered the sync send with a 502 (it often does after accepting the tx, S4 X20): the signed bytes
    // name the transaction, and its expiring window bounds how long it can still land. Ask the chain, never resend.
    const receipt = await awaitByHash(client as unknown as WalletClient, keccak256(raw), fields.validBefore);
    if (!receipt) throw new NotIncludedError(keccak256(raw), fields.validBefore, error);
    return { receipt, hash: receipt.transactionHash, fields };
  }
}

async function sendSplit<chain extends Chain>(client: WalletClient<Transport, chain, Account>, signed: Record<string, unknown>, onSigned: (hash: Hex | null) => void) {
  const account = client.account;
  const request = await prepareTransactionRequest(client, signed as never);
  const chain = client.chain;
  const signedTx = (await account.signTransaction!(request as never, { serializer: chain?.serializers?.transaction } as never)) as Hex;
  const envelope = chain?.serializers?.transactionEnvelope as ((p: { serializedTransaction: Hex; transaction: unknown }) => Promise<Hex>) | undefined;
  const serializedTransaction = envelope ? await envelope({ serializedTransaction: signedTx, transaction: request }) : signedTx;
  // The hash is final only when the fee payer has signed too (the relay's fill signs; a sponsored tx without that
  // signature is co-signed inside the send, which changes its bytes): otherwise the surface waits for the receipt's.
  const { Transaction } = await import("viem/tempo");
  const tx = Transaction.deserialize(serializedTransaction as never) as { feePayerSignature?: unknown };
  onSigned(signed.feePayer === true && !tx.feePayerSignature ? null : keccak256(serializedTransaction));
  const receipt = (await sendRawTransactionSync(client, { serializedTransaction } as never)) as TransactionReceipt;
  return { receipt, hash: receipt.transactionHash };
}

/** The expiring window closed with no receipt: the transaction can never land (L-08), so this is a definite failure. */
export class NotIncludedError extends Error {
  constructor(readonly hash: Hex, readonly validBeforeSec: number, cause: unknown) {
    super(`transaction ${hash} was not included before validBefore ${validBeforeSec}`, { cause });
    this.name = "NotIncludedError";
  }
}

/** The signed raw bytes of a raw send that failed at the transport (viem's `HttpRequestError.body`), else null. */
export function rawOfFailedSend(error: unknown): Hex | null {
  let e: unknown = error;
  for (let depth = 0; depth < 10 && e && typeof e === "object"; depth++) {
    const x = e as { name?: string; body?: { method?: string; params?: unknown[] } };
    if ((x.name === "HttpRequestError" || x.name === "TimeoutError") && /^eth_sendRawTransaction(Sync)?$/.test(x.body?.method ?? "")) {
      const raw = x.body?.params?.[0];
      return typeof raw === "string" && raw.startsWith("0x") ? (raw as Hex) : null;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

async function awaitByHash(client: WalletClient, hash: Hex, validBeforeSec: number): Promise<TransactionReceipt | null> {
  for (;;) {
    const receipt = await getTransactionReceipt(client, { hash }).catch(() => null);
    if (receipt) return receipt as TransactionReceipt;
    const block = await getBlock(client, { blockTag: "latest" }).catch(() => null);
    // Past the window (plus a block): a Tempo expiring-nonce transaction can no longer be included.
    if (block && Number(block.timestamp) > validBeforeSec + 1) {
      return ((await getTransactionReceipt(client, { hash }).catch(() => null)) as TransactionReceipt | null) ?? null;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
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
