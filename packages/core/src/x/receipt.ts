// Ported from Masayume 68f7a09:packages/core/src/x/receipt.ts — `lane` and `dryRun` added (S11, D-227).
import type { Side } from "../types/market";
import type { XRefusalReason } from "./parse";

/** What became of one mention — every state a reply or a row can be in. */
export const X_RECEIPT_STATUSES = ["refused", "submitted", "filled", "nothing-filled", "reverted", "unknown"] as const;
export type XReceiptStatus = (typeof X_RECEIPT_STATUSES)[number];

/** Stable public categories. Provider diagnostics stay out of replies and reply images. */
export type XRefusalCode =
  | "account-not-linked" | "instruction-invalid" | "balance-unavailable" | "not-deployed"
  | "grant-missing" | "grant-mismatch" | "grant-expired" | "no-window"
  | "quote-unavailable" | "no-liquidity" | "price-moved" | "permission-denied"
  | "insufficient-funds" | "execution-unavailable" | "unconfirmed"
  | "grant-update-required" | "position-limit" | "price-limit" | "execution-paused"
  | "market-data-unavailable" | "window-entry-closed" | "window-not-started" | "opening-price-pending";

/** Optional for receipts written before booked amounts and resolved market details were retained. */
export interface XReceiptDetails {
  bookedCostBase?: string | null;
  bookedContractsRaw?: string | null;
  avgPriceBps?: number | null;
  asset?: string | null;
  intervalSec?: number | null;
  expirySec?: number | null;
  refusalCode?: XRefusalCode | null;
  parseRefusal?: XRefusalReason | null;
  entryClosesAtSec?: number | null;
  nextWindowAtSec?: number | null;
  /** Durable execution context, captured before the order lane can broadcast. */
  executionActor?: string | null;
  poolAddress?: string | null;
  collateralDecimals?: number | null;
  intentRecordedAtMs?: number | null;
  journalState?: "recorded" | "sent" | "confirmed" | "failed" | "unknown" | null;
  recoveryFromBlock?: string | null;
  expectedNonce?: number | null;
  /** S11 (D-227): the lane the Window was found on, and whether the relay only planned it (dry run: nothing signed). */
  lane?: string | null;
  dryRun?: boolean | null;
}

/** A receipt links the instruction to the grant, the Window, the transaction and the beneficiary. */
export interface XReceipt extends XReceiptDetails {
  mentionId: string;
  authorId: string;
  handle: string | null;
  wallet: string | null;
  grantId: string | null;
  marketId: string | null;
  side: Side | null;
  /** Requested stake, preserved independently of actual bookedCostBase. */
  stakeBase: string | null;
  status: XReceiptStatus;
  reason: string | null;
  txHash: string | null;
  instruction: string;
  atMs: number;
}
