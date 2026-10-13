// Ported from Masayume 68f7a09:packages/core/src/x/refusal.ts — S11 (D-227): Mitoshi's words, at Owarine's length or less.
import type { XReceiptDetails, XRefusalCode } from "./receipt";
import { describeRefusal, type XRefusalReason } from "./parse";

/** Safe, shared recovery copy for public replies and the app's receipt list. */
export const X_REFUSAL_DETAILS: Record<XRefusalCode, string> = {
  "account-not-linked": "Link your X account on mitoshi.xyz/trade-from-x.",
  "instruction-invalid": "Try: BTC UP 5m $5.",
  "balance-unavailable": "Your X balance couldn't be read. Try again shortly.",
  "not-deployed": "Trading is unavailable on this network.",
  "grant-missing": "Turn on X trading in the app.",
  "grant-mismatch": "Turn X trading on again in the app.",
  "grant-expired": "X trading expired. Renew it in the app; your funds are yours.",
  "grant-update-required": "Turn X trading on again in the app. No new deposit needed.",
  "no-window": "No Window for that asset and timeframe right now.",
  "market-data-unavailable": "Markets couldn't be checked. Nothing was placed.",
  "window-entry-closed": "Entries closed for this Window.",
  "window-not-started": "This Window hasn't started.",
  "opening-price-pending": "This Window is waiting for its opening price.",
  "quote-unavailable": "No current quote. Nothing was placed.",
  "no-liquidity": "Nothing to fill at that size.",
  "price-moved": "The price moved. Nothing was placed.",
  "permission-denied": "X trading refused this order. Check it in the app.",
  "insufficient-funds": "More than your X balance. Add funds or ask for less.",
  "position-limit": "X trading has 8 open Windows already.",
  "price-limit": "Above X trading's price limit.",
  "execution-paused": "X trading is paused.",
  "execution-unavailable": "Execution is unavailable. Check the app.",
  unconfirmed: "Not confirmed. Check the app before trying again.",
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
    return { title, detail: `${detail[0]!.toUpperCase()}${detail.slice(1)}. Try: BTC UP 5m $5.` };
  }
  const cutoff = time(receipt.entryClosesAtSec);
  if (code === "window-entry-closed" && cutoff) return { title, detail: `Entries closed at ${cutoff}.` };
  const next = time(receipt.nextWindowAtSec);
  if (code === "window-not-started" && next) return { title, detail: `This Window starts at ${next}.` };
  return { title, detail: Object.hasOwn(X_REFUSAL_DETAILS, code) ? X_REFUSAL_DETAILS[code] : X_REFUSAL_DETAILS.unconfirmed };
}

export function xReceiptRecovery(code: XRefusalCode | null | undefined): { label: string; href: string } | null {
  if (code && ["no-window", "market-data-unavailable", "window-entry-closed", "window-not-started", "opening-price-pending", "instruction-invalid"].includes(code)) {
    return { label: "Build a call", href: "/trade-from-x#x-instruction" };
  }
  if (code === "position-limit") return { label: "Review positions", href: "/portfolio" };
  if (code && ["grant-missing", "grant-mismatch", "grant-expired", "grant-update-required", "permission-denied", "price-limit", "insufficient-funds", "account-not-linked"].includes(code)) {
    return { label: code === "insufficient-funds" ? "Add funds" : code === "grant-expired" ? "Renew" : "Check X trading", href: "/trade-from-x#x-trading" };
  }
  return null;
}
