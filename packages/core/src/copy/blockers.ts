// Ported from Masayume 68f7a09:packages/core/src/copy/blockers.ts. R6 (D-230, owner point 2): a blocker that names a fix
// IS the action — every kind returns its words AND, where one exists, the fix as data (no functions), so the CTA can
// be that fix instead of a dead grey button. Owarine's word count is the budget: a label is ≤ 6 words / 30 characters
// (the pill), a reason ≤ 10 words / one line at 320 px (the caption under it). The copy test holds both.

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
  /** A brand-new account's first test dollars are landing (R4-4, D-227): the order waits for them, it isn't short. */
  "funding",
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
  // S6, ported from Agari 03b30ab:packages/core/src/copy/blockers.ts: the session and the lane, named before the phase.
  "session-closed",
  "halted",
  "lane-paused",
  "corporate-action",
] as const;

export type BlockerKind = (typeof BLOCKER_KINDS)[number];

/**
 * The one tap that clears a blocker, as data. `add-money`, `sign-in` and `switch-chain` run anywhere (the kit has the
 * handlers); the rest need the host's handler (`BlockedCta`'s `onFix`), and without one the CTA stays a stated block —
 * never a fake action. `label` overrides the default words (`fixLabel`).
 */
export type BlockerFix =
  | { kind: "add-money"; label?: string }
  | { kind: "sign-in"; label?: string }
  | { kind: "switch-chain"; label?: string }
  | { kind: "retry"; label?: string }
  /** Set the stake to `amountText` ("Use $1"; "Buy $3.40 — what fills" via `label`). */
  | { kind: "set-stake"; amountText: string; label?: string }
  /** Move to another live Window ("Try AAPL 15m →"). */
  | { kind: "other-window"; windowText: string; label?: string }
  | { kind: "use-public"; label?: string }
  | { kind: "use-1x"; label?: string };

export type BlockerFixKind = BlockerFix["kind"];

export interface BlockerCopy {
  /** The stated block: the pill's words when no fix can run here, and the accessible name's first half. */
  label: string;
  /** One line of why under the CTA (≤ 10 words), or null when the label says it all. */
  reason: string | null;
  fix: BlockerFix | null;
  /** A wait, not a refusal (connecting, quoting…): drawn as a named wait, never a dead button. */
  busy?: boolean;
  kind?: BlockerKind;
}

export interface BlockerContext {
  chainName?: string;
  minStakeText?: string;
  spendableText?: string;
  /** `over-balance`: what the account holds is under the minimum stake, so the fix is Add money, not "Use $x". */
  spendableBelowMin?: boolean;
  quotedCents?: number;
  cadence?: string;
  nextStartText?: string;
  fillableStakeText?: string;
  quoteAgeSec?: number;
  privateMinText?: string;
  privateCapText?: string;
  /** `session-closed`: the next open in the reader's zone ("Mon 14:30 (09:30 ET)"). */
  opensText?: string;
  /** `halted`: the halt is RedStone's health ("Signed price stale"), not the exchange's. */
  haltStale?: boolean;
  /** A live Window the user can move to ("AAPL 15m"): locked, closed, off-band and late-print blockers offer it. */
  altWindowText?: string;
  /** The reserve's or desk's own refusal line (`quote-refused`, `boost-refused`, `private-refused`). */
  refusalText?: string;
  /** `pending-opening-print`: when and why, live ("Opens 15:20 · price network late"). */
  openingText?: string;
}

const DEFAULT_CHAIN = "Tempo";
const DEFAULT_MIN_STAKE = "$1";

const stated = (label: string, reason: string | null = null, fix: BlockerFix | null = null): BlockerCopy => ({ label, reason, fix });
const waiting = (label: string, reason: string | null = null): BlockerCopy => ({ label, reason, fix: null, busy: true });
const otherWindow = (ctx: BlockerContext): BlockerFix | null => (ctx.altWindowText ? { kind: "other-window", windowText: ctx.altWindowText } : null);
const setStake = (amountText: string | undefined, label?: string): BlockerFix | null =>
  amountText ? (label ? { kind: "set-stake", amountText, label } : { kind: "set-stake", amountText }) : null;

function copyOf(kind: BlockerKind, ctx: BlockerContext): BlockerCopy {
  const min = ctx.minStakeText ?? DEFAULT_MIN_STAKE;
  switch (kind) {
    case "quote-refused":
      return stated("Reserve refused this band", ctx.refusalText ?? null);
    case "boost-refused":
      return stated("Reserve refused this boost", ctx.refusalText ?? null, { kind: "use-1x" });
    case "disconnected":
      return stated("Sign in to place", null, { kind: "sign-in", label: "Sign in to place" });
    case "connecting":
      return waiting("Connecting…");
    case "wrong-chain":
      return stated(`Switch to ${ctx.chainName ?? DEFAULT_CHAIN}`, "Your wallet is on another network.", { kind: "switch-chain", label: `Switch to ${ctx.chainName ?? DEFAULT_CHAIN}` });
    case "syncing":
      return waiting("Syncing the clock…");
    case "placing":
      return waiting("Placing…");
    case "upcoming":
      return stated(ctx.nextStartText ? `Opens in ${ctx.nextStartText}` : "Opens soon", "Not trading yet.");
    case "pending-opening-print":
      return stated("Waiting for the opening price", ctx.openingText ?? null, otherWindow(ctx));
    case "no-entry-buffer":
      return ctx.nextStartText ? stated(`Next ${ctx.cadence ? `${ctx.cadence} ` : ""}Window in ${ctx.nextStartText}`, "Between rounds.") : stated("Between rounds");
    case "locked":
      return stated("Locked — settling next", "Calls closed for this Window.", otherWindow(ctx));
    case "settling":
      return waiting("Settling…");
    case "no-funds":
      return stated("No funds yet", "No funds yet.", { kind: "add-money" });
    case "funding":
      return waiting("Funding your account…", "Your first dollars are landing.");
    case "fee-token":
      return stated("Fee not covered", "Tempo fees are paid in dollars.", { kind: "add-money" });
    case "region-restricted":
      return stated("Browse-only in your region", "Exits and claims stay open.");
    case "no-side":
      return stated("Pick UP or DOWN");
    case "no-stake":
      return stated("Enter a stake");
    case "below-min-stake":
      return stated("Below the minimum", `Minimum stake is ${min}.`, setStake(min));
    case "over-balance":
      return stated(
        "Over your balance",
        ctx.spendableText ? `Your balance is ${ctx.spendableText}.` : null,
        ctx.spendableBelowMin || !ctx.spendableText ? { kind: "add-money" } : setStake(ctx.spendableText),
      );
    case "quoting":
      return waiting("Getting a price…");
    case "no-liquidity-at-size":
      return ctx.fillableStakeText
        ? stated("No sellers at this size", "Nobody sells more right now.", setStake(ctx.fillableStakeText, `Buy ${ctx.fillableStakeText} — what fills`))
        : stated("No sellers at this size", "Try a smaller stake.");
    case "over-book":
      return stated("Over what the book fills", "The book can't fill the rest.", setStake(ctx.fillableStakeText, ctx.fillableStakeText ? `Use ${ctx.fillableStakeText} — fills now` : undefined));
    case "outside-band-low":
      return stated("Too long a shot", `Quoting ${ctx.quotedCents ?? 1}¢ — outside 2–97¢.`, otherWindow(ctx));
    case "outside-band-high":
      return stated("Too close to certain", `Quoting ${ctx.quotedCents ?? 99}¢ — outside 2–97¢.`, otherWindow(ctx));
    case "stale-quote":
      return waiting("Requoting…", ctx.quoteAgeSec === undefined ? null : `Quote is ${ctx.quoteAgeSec}s old.`);
    case "daily-stop":
      return stated("Daily Stop hit", "Calls reopen at midnight.");
    case "stop-unverified":
      return stated("Daily Stop unchecked", "Couldn't verify it just now.", { kind: "retry", label: "Check Daily Stop again" });
    case "no-exit":
      return stated("No bids at this size", "Try a smaller exit.");
    case "private-probing":
      return waiting("Checking private mode…");
    case "private-unavailable":
      return stated("Private mode unavailable", "Public works now.", { kind: "use-public" });
    case "private-below-min":
      return stated("Below the private minimum", `Private bets start at ${ctx.privateMinText ?? DEFAULT_MIN_STAKE}.`, setStake(ctx.privateMinText ?? DEFAULT_MIN_STAKE));
    case "private-over-cap":
      return stated("Over the private cap", ctx.privateCapText ? `Private bets cap at ${ctx.privateCapText}.` : null, setStake(ctx.privateCapText));
    case "private-unreadable":
      return stated("Private balance unreadable", "Couldn't read it just now.", { kind: "retry", label: "Retry private balance" });
    case "private-refused":
      return stated("Desk refused this bet", ctx.refusalText ?? null);
    case "session-closed":
      return stated("Market closed", ctx.opensText ? `Opens ${ctx.opensText}.` : null, otherWindow(ctx));
    case "halted":
      return stated(ctx.haltStale ? "Signed price stale" : "Trading halted", "No new calls.");
    case "lane-paused":
      return stated("Paused", "No signed price source.");
    case "corporate-action":
      return stated("Paused", "Corporate action in progress.");
  }
}

/** Every blocker's words and fix (D-230): the label, one line of why, and the one tap that clears it, if any. */
export function blocker(kind: BlockerKind, ctx: BlockerContext = {}): BlockerCopy {
  return { ...copyOf(kind, ctx), kind };
}

/** The blocker IS the control's label — one derived string for the CTA and its accessible name (unchanged signature). */
export function blockerLabel(kind: BlockerKind, ctx: BlockerContext = {}): string {
  return copyOf(kind, ctx).label;
}

/** One line where there is no caption slot (the terminal's note under UP/DOWN): "Market closed · Opens Mon 14:30". */
export function blockerLine(kind: BlockerKind, ctx: BlockerContext = {}): string {
  const { label, reason } = copyOf(kind, ctx);
  return reason && reason.replace(/\.$/, "") !== label ? `${label} · ${reason.replace(/\.$/, "")}` : label;
}

/** One source for a fix's words, shared by BlockedCta, ErrorState and TxFailureCard ("Add money" = SHELL.addMoney). */
export function fixLabel(fix: BlockerFix): string {
  if (fix.label) return fix.label;
  switch (fix.kind) {
    case "add-money":
      return "Add money";
    case "sign-in":
      return "Sign in";
    case "switch-chain":
      return `Switch to ${DEFAULT_CHAIN}`;
    case "retry":
      return "Retry";
    case "set-stake":
      return `Use ${fix.amountText}`;
    case "other-window":
      return `Try ${fix.windowText} →`;
    case "use-public":
      return "Use public";
    case "use-1x":
      return "Use 1×";
  }
}

/** `blocker` under a name that doesn't collide with a host's own `blocker` variable. */
export { blocker as blockerCopy };
