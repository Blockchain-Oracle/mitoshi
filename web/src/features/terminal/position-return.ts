// Ported from Owarine 90a91d71:web/src/features/terminal/position-return.ts (D-227) — why a row has the number it has,
// or none: missing bids are not a break-even return. Mitoshi's statuses over `PositionValue`: priced (the walk takes it
// all, "≈" while repriced), partial (a thin book: "N% sellable", P&L on that part), settled (the Window answered: the
// known payout), and the unpriced ones that say why — no bids, locked, settling, updating (the cost not indexed yet),
// reading (no answer yet). Only the priced three count in the totals; the rest sit in equity at cost.
import { TERMINAL } from "./copy";
import { clockText } from "./format";

export type PositionStatus = "priced" | "partial" | "settled" | "no-bids" | "locked" | "settling" | "updating" | "reading";

export const isPriced = (s: PositionStatus): boolean => s === "priced" || s === "partial" || s === "settled";

/** Add, Reduce and TP/SL need a book that takes a sale. */
export const canTrade = (s: PositionStatus): boolean => s === "priced" || s === "partial";

/** The row's status line ("" when the figures say it all); a settled row says whether its payout is anything. */
export function statusText(s: PositionStatus, expirySec: number, fillablePct: number | null, settled: "resolved" | "voided" | null, valueBase: bigint | null = null): string {
  const t = TERMINAL.positions;
  switch (s) {
    case "partial":
      return t.sellable(fillablePct ?? 0);
    case "settled":
      return settled === "voided" ? t.voided : valueBase === 0n ? t.resolvedLost : t.resolved;
    case "locked":
      return t.status.locked(clockText(expirySec));
    case "settling":
      return t.status.settling;
    case "no-bids":
      return t.status.noBids;
    case "updating":
      return t.status.updating;
    default:
      return "";
  }
}
