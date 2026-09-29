/**
 * The ONE module that sends a Tempo transaction (`write-boundary` invariant; plan C.2.3). Every send:
 * - carries its calls as one atomic batch (`calls[]`),
 * - names pathUSD as the fee token (N-12) and an explicit priority fee,
 * - asks our relay to pay (`feePayer: true`, routed by `withRelay`) when the area policy covers it,
 * - sets its nonce explicitly (expiring for keys and taps, X21),
 * - waits for the receipt in the same round trip (`sendTransactionSync`, ~0.5 s finality).
 */
import type { Account, Chain, Hex, TransactionReceipt, Transport, WalletClient } from "viem";
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
      ...(request.sponsored ? { feePayer: true as const } : {}),
      ...fields,
      maxPriorityFeePerGas: PRIORITY_FEE_PER_GAS,
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
