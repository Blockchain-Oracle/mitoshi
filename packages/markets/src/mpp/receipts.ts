/**
 * The receipt hook (plan C.5.3, D-033): every paid MPP response becomes one `mpp_receipts` row, linked to the decision
 * that caused it through an AsyncLocalStorage scope — `withReceiptScope({ decisionId }, () => readAgentVerdict(…))` —
 * so the brain never threads ids through the AI SDK. Charge receipts carry the TIP-20 transfer's tx hash as
 * `reference`; session receipts carry the channel id, the accepted cumulative voucher and the spend (no per-request
 * transaction exists — D-033).
 * Server-only (`node:async_hooks`); exported through `@cwf/markets/server`.
 * Docs: tempo docs guide/machine-payments/client "Read MPP payment receipts"; mppx `Receipt`, `SessionReceipt`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { Receipt } from "mppx";
import type { Address } from "viem";
import type { MppOffer } from "./challenges";

/** What a payment is for. At most one id is usually set; all are optional so a probe or a recount can pay unscoped. */
export interface ReceiptScope {
  decisionId?: string;
  rebalanceId?: string;
  senseiId?: string;
  /** Free-form purpose for unscoped spends (`indexer-recount`, `x10-probe`). */
  purpose?: string;
}

const scopes = new AsyncLocalStorage<ReceiptScope>();

/** Runs `fn` with `scope` attached to every MPP receipt recorded inside it (including nested awaits). */
export function withReceiptScope<T>(scope: ReceiptScope, fn: () => T): T {
  return scopes.run({ ...scopes.getStore(), ...scope }, fn);
}

export function currentReceiptScope(): ReceiptScope {
  return scopes.getStore() ?? {};
}

/** One row of `mpp_receipts` (packages/db migrations/mpp). Money in base units. */
export interface MppReceiptRow {
  chainId: number;
  host: string;
  path: string;
  method: string;
  intent: string;
  status: "paid" | "failed";
  challengeId: string;
  currency: Address;
  amountBase: bigint;
  recipient: Address | null;
  payer: Address;
  /** Charge: the transfer tx hash. Session: the channel id. Null only on a failed payment. */
  reference: string | null;
  channelId: string | null;
  acceptedCumulativeBase: bigint | null;
  spentBase: bigint | null;
  scope: ReceiptScope;
  /** The receipt as the server sent it (base64url-decoded JSON), or the failure text. */
  raw: unknown;
  receivedAtMs: number;
}

/** Where rows go: `@cwf/db` `insertMppReceipt` in ops/web, an array in tests. Must not throw into the caller's path. */
export type ReceiptSink = (row: MppReceiptRow) => Promise<void> | void;

/** Parses `Payment-Receipt`; null when the header is absent (not paid, or the server omitted it). */
export function readPaymentReceipt(response: Response): (Receipt.Receipt & Record<string, unknown>) | null {
  if (!response.headers.get("payment-receipt")) return null;
  return Receipt.fromResponse(response) as Receipt.Receipt & Record<string, unknown>;
}

const bigOrNull = (v: unknown): bigint | null => (typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : typeof v === "bigint" ? v : null);

export interface RowInput {
  url: string;
  offer: MppOffer;
  payer: Address;
  receipt: (Receipt.Receipt & Record<string, unknown>) | null;
  failure?: string;
  nowMs?: number;
}

/** Builds the row for one paid (or failed) request. */
export function receiptRow({ url, offer, payer, receipt, failure, nowMs = Date.now() }: RowInput): MppReceiptRow {
  const u = new URL(url);
  const session = offer.intent === "session";
  return {
    chainId: offer.chainId ?? 0,
    host: u.host,
    path: u.pathname,
    method: offer.method,
    intent: offer.intent,
    status: receipt && !failure ? "paid" : "failed",
    challengeId: offer.id,
    currency: offer.currency,
    amountBase: offer.amountBase,
    recipient: offer.recipient,
    payer,
    reference: receipt?.reference ?? null,
    channelId: session ? ((receipt?.channelId as string | undefined) ?? receipt?.reference ?? null) : null,
    acceptedCumulativeBase: session ? bigOrNull(receipt?.acceptedCumulative) : null,
    spentBase: session ? bigOrNull(receipt?.spent) : null,
    scope: currentReceiptScope(),
    raw: failure ? { failure } : receipt,
    receivedAtMs: nowMs,
  };
}

/** Delivers a row without letting a sink failure break the paid call (the payment already happened). */
export async function deliver(sink: ReceiptSink | undefined, row: MppReceiptRow, onError: (e: unknown) => void = () => undefined): Promise<void> {
  if (!sink) return;
  try {
    await sink(row);
  } catch (error) {
    onError(error);
  }
}
