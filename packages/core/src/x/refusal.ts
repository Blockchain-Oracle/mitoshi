// Ported from Masayume 68f7a09:packages/core/src/x/refusal.ts
import type { XReceiptDetails, XRefusalCode } from "./receipt";
import { describeRefusal, type XRefusalReason } from "./parse";

/** Safe, shared recovery copy for public replies and the app's receipt list. */
export const X_REFUSAL_DETAILS: Record<XRefusalCode, string> = {
  "account-not-linked": "Link your X account to your wallet in the app.",
  "instruction-invalid": "Use BTC or ETH, UP or DOWN, an amount, and a Window.",
  "balance-unavailable": "Your X trading balance could not be checked. Try again shortly.",
  "not-deployed": "Trading is unavailable on this network.",
  "grant-missing": "Fund and enable X trading in the app.",
  "grant-mismatch": "Reconnect X trading to the current service in the app.",
  "grant-expired": "Renew X trading in the app. Your remaining funds are still yours.",
  "grant-update-required": "Update X trading in the app to use your funded balance. No additional deposit is needed.",
  "no-window": "No Window is available for this asset and timeframe. Check live Windows in the app.",
  "market-data-unavailable": "We could not check live markets. Try again shortly; your instruction was not executed.",
  "window-entry-closed": "Entry has closed for this Window. Check live Windows before sending a new instruction.",
  "window-not-started": "This Window has not started. Check live Windows before sending a new instruction.",
  "opening-price-pending": "This Window is waiting for its opening price. Try again once it is ready in the app.",
  "quote-unavailable": "A current quote could not be confirmed.",
  "no-liquidity": "No fillable quote was available for this instruction.",
  "price-moved": "The price moved beyond the accepted cost.",
  "permission-denied": "X trading could not use its current permission. Check X trading in the app.",
  "insufficient-funds": "This order exceeds the available X balance. Fund X trading or request a smaller amount.",
  "position-limit": "Your X permission has reached its open-position limit. Review positions in Portfolio.",
  "price-limit": "Your X permission still has an entry-price restriction. Update X trading in the app.",
  "execution-paused": "X execution is paused by the service. Check its status in the app.",
  "execution-unavailable": "Execution is unavailable; check the app for status.",
  unconfirmed: "The order could not be confirmed. Check the app before trying again.",
};

export const X_REFUSAL_TITLES = {
  "market-data-unavailable": "Market check unavailable", "window-entry-closed": "Entries closed",
  "window-not-started": "Window not started", "opening-price-pending": "Waiting for opening price",
  "no-window": "Window unavailable", "instruction-invalid": "Check your instruction",
  "grant-update-required": "Update X trading", "insufficient-funds": "Not enough X balance",
} as const;

const PARSE_REASONS: readonly XRefusalReason[] = ["empty", "no-side", "two-sides", "no-asset", "unknown-asset", "two-assets", "no-stake", "bad-stake", "two-stakes", "no-cadence", "cadence-not-listed", "two-cadences", "unknown-token"];
function time(sec: number | null | undefined): string | null {
  return typeof sec === "number" && Number.isSafeInteger(sec) && sec >= 0 && sec <= 253402300799
    ? new Date(sec * 1000).toISOString().slice(11, 19) + " UTC" : null;
}

/** Both public text and images use validated reasons, never raw provider or mention text. */
export function xRefusalCopy(receipt: XReceiptDetails): { title: string; detail: string } {
  const code = receipt.refusalCode ?? "unconfirmed";
  const title = Object.hasOwn(X_REFUSAL_TITLES, code) ? X_REFUSAL_TITLES[code as keyof typeof X_REFUSAL_TITLES] : "Order not confirmed";
  if (code === "instruction-invalid" && receipt.parseRefusal && PARSE_REASONS.includes(receipt.parseRefusal)) {
    const detail = describeRefusal(receipt.parseRefusal);
    return { title, detail: `${detail[0]!.toUpperCase()}${detail.slice(1)}. Example: BTC UP 5 15m.` };
  }
  const cutoff = time(receipt.entryClosesAtSec);
  if (code === "window-entry-closed" && cutoff) return { title, detail: `Entry closed at ${cutoff}. Check live Windows before sending a new instruction.` };
  const next = time(receipt.nextWindowAtSec);
  if (code === "window-not-started" && next) return { title, detail: `This Window starts at ${next}. Check it is ready before sending a new instruction.` };
  return { title, detail: Object.hasOwn(X_REFUSAL_DETAILS, code) ? X_REFUSAL_DETAILS[code] : X_REFUSAL_DETAILS.unconfirmed };
}

export function xReceiptRecovery(code: XRefusalCode | null | undefined): { label: string; href: string } | null {
  if (code && ["no-window", "market-data-unavailable", "window-entry-closed", "window-not-started", "opening-price-pending", "instruction-invalid"].includes(code)) {
    return { label: "Build an X instruction", href: "/trade-from-x#x-instruction" };
  }
  if (code === "position-limit") return { label: "Review positions", href: "/portfolio" };
  if (code && ["grant-missing", "grant-mismatch", "grant-expired", "grant-update-required", "permission-denied", "price-limit", "insufficient-funds", "account-not-linked"].includes(code)) {
    return { label: code === "insufficient-funds" ? "Manage X balance" : code === "grant-expired" ? "Renew X trading" : "Check X trading", href: "/trade-from-x#x-trading" };
  }
  return null;
}
