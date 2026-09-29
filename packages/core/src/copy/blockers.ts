// Ported from Masayume 68f7a09:packages/core/src/copy/blockers.ts
import { DAILY_STOP_HIT, PLACING, SETTLING } from "./strings";

export const BLOCKER_KINDS = [
  "disconnected",
  "connecting",
  "wrong-chain",
  "syncing",
  "placing",
  "upcoming",
  "pending-opening-print",
  "no-entry-buffer",
  "locked",
  "settling",
  "no-funds",
  "fee-token",
  "region-restricted",
  "no-side",
  "no-stake",
  "below-min-stake",
  "over-balance",
  "quoting",
  "no-liquidity-at-size",
  /** The book fills part of this stake: the guard names the ceiling and the amount stays the user's (the reference never clamps). */
  "over-book",
  "outside-band-low",
  "outside-band-high",
  "stale-quote",
  "quote-refused",
  "boost-refused",
  "daily-stop",
  "stop-unverified",
  "no-exit",
  // The private route's own ladder — the reference's `privBlocker` (`Ticket624Drawer.tsx` L443–448).
  "private-probing",
  "private-unavailable",
  "private-below-min",
  "private-over-cap",
  "private-unreadable",
  "private-refused",
] as const;

export type BlockerKind = (typeof BLOCKER_KINDS)[number];

export interface BlockerContext {
  chainName?: string;
  minStakeText?: string;
  spendableText?: string;
  quotedCents?: number;
  cadence?: string;
  nextStartText?: string;
  fillableStakeText?: string;
  quoteAgeSec?: number;
  privateMinText?: string;
  privateCapText?: string;
}

const DEFAULT_CHAIN = "Tempo";
const DEFAULT_MIN_STAKE = "$1";

/** The blocker IS the control's label — one derived string for the CTA and its accessible name. */
export function blockerLabel(kind: BlockerKind, ctx: BlockerContext = {}): string {
  switch (kind) {
    case "quote-refused":
      return "The reserve refused this band — see why above";
    case "boost-refused":
      return "The reserve refused this boost — see why above";
    case "disconnected":
      return "Sign in to call it";
    case "connecting":
      return "Connecting…";
    case "wrong-chain":
      return `Switch to ${ctx.chainName ?? DEFAULT_CHAIN}`;
    case "syncing":
      return "Syncing the chain clock…";
    case "placing":
      return PLACING;
    case "upcoming":
      return "Opens soon — not trading yet";
    case "pending-opening-print":
      return "Waiting for the opening print";
    case "no-entry-buffer":
      return ctx.nextStartText
        ? `Between rounds — next ${ctx.cadence ? `${ctx.cadence} ` : ""}Window opens in ${ctx.nextStartText}`
        : "Between rounds";
    case "locked":
      return "Window locked — settling next";
    case "settling":
      return SETTLING;
    case "no-funds":
      return "No funds yet — add funds";
    case "fee-token":
      return "Fee not covered — add funds";
    case "region-restricted":
      return "Browse-only in your region";
    case "no-side":
      return "Pick UP or DOWN";
    case "no-stake":
      return "Enter a stake";
    case "below-min-stake":
      return `Minimum stake ${ctx.minStakeText ?? DEFAULT_MIN_STAKE} — below this the venue rounds your order to nothing`;
    case "over-balance":
      return ctx.spendableText ? `Stake exceeds your ${ctx.spendableText} balance` : "Stake exceeds your balance";
    case "quoting":
      return "Quoting…";
    case "no-liquidity-at-size":
      return "No liquidity at this size — nobody is on the other side of this book";
    case "over-book":
      return ctx.fillableStakeText ? `Above what the book can fill — up to ${ctx.fillableStakeText}` : "Above what the book can fill";
    case "outside-band-low":
      return `Too close to impossible — this book is quoting ${ctx.quotedCents ?? 1}¢`;
    case "outside-band-high":
      return `Too close to certain — this book is quoting ${ctx.quotedCents ?? 99}¢`;
    case "stale-quote":
      return ctx.quoteAgeSec === undefined ? "Quote is stale — requoting" : `Quote is ${ctx.quoteAgeSec}s old — requoting`;
    case "daily-stop":
      return DAILY_STOP_HIT;
    case "stop-unverified":
      return "Can't verify your Daily Stop — try again";
    case "no-exit":
      return "No exit right now — no bids at this size";
    case "private-probing":
      return "Checking private mode…";
    case "private-unavailable":
      return "Private mode is not available right now";
    case "private-below-min":
      return `Private bets start at ${ctx.privateMinText ?? DEFAULT_MIN_STAKE}`;
    case "private-over-cap":
      return ctx.privateCapText ? `Private bets are capped at ${ctx.privateCapText}` : "Over the private cap";
    case "private-unreadable":
      return "Could not read your private balance just now — try again in a moment";
    case "private-refused":
      return "The desk refused this bet — see why above";
  }
}
