/**
 * MPP 402 challenges in one flat shape (plan C.5.3, spike X10). A `402 Payment Required` carries one
 * `WWW-Authenticate: Payment …` entry per way to pay; each names a method (`tempo`), an intent (`charge` = one TIP-20
 * transfer per request with an on-chain reference; `session` = a TIP-1034 channel plus off-chain vouchers) and a
 * base64url `request` with the amount, currency, chain and recipient. mppx parses the header; this flattens it for
 * caps, logs, the X10 probe and `/status`.
 * Docs: tempo docs guide/machine-payments/{client,one-time-payments,pay-as-you-go}; mppx `Challenge`.
 */
import { Challenge } from "mppx";
import { getAddress, type Address } from "viem";

export type MppIntent = "charge" | "session" | (string & {});

export interface MppOffer {
  id: string;
  realm: string;
  method: string;
  intent: MppIntent;
  /** Raw token units per request (the request's `amount`). */
  amountBase: bigint;
  currency: Address;
  chainId: number | null;
  recipient: Address | null;
  /** Session only: the channel escrow and the server's suggested opening deposit. */
  escrow: Address | null;
  suggestedDepositBase: bigint | null;
  /** The server sponsors the payment transaction's fee. */
  feePayer: boolean;
  description: string | null;
  /** ISO-8601 time the challenge stops being payable. */
  expiresIso: string | null;
}

const addr = (v: unknown): Address | null => (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) ? getAddress(v) : null);
const big = (v: unknown): bigint | null => (typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : typeof v === "number" && Number.isInteger(v) ? BigInt(v) : null);

/** One challenge → one offer. Throws on a challenge without an integer amount or a currency address. */
export function offerOf(challenge: Challenge.Challenge): MppOffer {
  const request = challenge.request as Record<string, unknown>;
  const details = (request.methodDetails ?? {}) as Record<string, unknown>;
  const amountBase = big(request.amount);
  const currency = addr(request.currency);
  if (amountBase === null || currency === null) throw new Error(`challenge ${challenge.id}: amount/currency are not base units and an address`);
  const chainId = typeof details.chainId === "number" ? details.chainId : typeof request.chainId === "number" ? request.chainId : null;
  return {
    id: challenge.id,
    realm: challenge.realm,
    method: challenge.method,
    intent: challenge.intent,
    amountBase,
    currency,
    chainId,
    recipient: addr(request.recipient),
    escrow: addr(details.escrowContract),
    suggestedDepositBase: big(request.suggestedDeposit),
    feePayer: details.feePayer === true || request.feePayer === true,
    description: challenge.description ?? null,
    expiresIso: challenge.expires ?? null,
  };
}

/** Every offer in a 402 response, in the server's order. Empty for a response that is not a payment challenge. */
export function offersOf(response: Response): MppOffer[] {
  if (response.status !== 402) return [];
  return Challenge.fromResponseList(response).map((c) => offerOf(c as Challenge.Challenge));
}

export interface ProbeResult {
  url: string;
  status: number;
  offers: MppOffer[];
  /** `charge` offered at all → a per-request on-chain receipt is possible (D-033). */
  chargeOffered: boolean;
  sessionOffered: boolean;
}

/**
 * The unpaid probe (spike X10; `/status`): send the request with no credential and read what the server asks for.
 * Pays nothing, signs nothing.
 */
export async function probeMpp(url: string, init: RequestInit = {}, fetchFn: typeof fetch = fetch): Promise<ProbeResult> {
  const response = await fetchFn(url, init);
  const offers = offersOf(response);
  await response.body?.cancel().catch(() => undefined);
  return {
    url,
    status: response.status,
    offers,
    chargeOffered: offers.some((o) => o.intent === "charge"),
    sessionOffered: offers.some((o) => o.intent === "session"),
  };
}
