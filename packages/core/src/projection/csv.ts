// Ported from Masayume 68f7a09:packages/core/src/projection/csv.ts
import { formatCadence } from "../copy/between-rounds";
import { OUTCOME_TO_SIDE } from "../types/market";
import { formatBaseUnits } from "../units/format";
import { roundSettledAtMs } from "./settle";
import type { SettledRound } from "./types";

const HEADERS = ["Market", "Asset", "Cadence", "Sides", "Expiry (UTC)", "Settled (UTC)", "Contracts held", "Stake", "Sold back", "Payout", "Net", "Outcome", "Claim", "Entry tx"] as const;

function escape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Full precision, ungrouped, so a spreadsheet parses every figure as a number. */
function money(value: bigint, decimals: number): string {
  return formatBaseUnits(value, decimals, { maxDp: decimals, minDp: 2, group: false, signed: false });
}

/** The settled rounds as they are shown, one row each — never a subset, never a rounded figure. */
export function roundsToCsv(rounds: readonly SettledRound[]): string {
  const lines = rounds.map((round) =>
    [
      round.marketId,
      round.asset,
      formatCadence(round.intervalSec),
      round.sidesTraded.map((idx) => OUTCOME_TO_SIDE[idx].toUpperCase()).join("+"),
      new Date(round.expirySec * 1000).toISOString(),
      new Date(roundSettledAtMs(round)).toISOString(),
      money(round.legs.reduce((sum, leg) => sum + leg.amountRaw, 0n), round.decimals),
      money(round.stakeBase, round.decimals),
      money(round.proceedsBase, round.decimals),
      money(round.payoutBase, round.decimals),
      money(round.pnlBase, round.decimals),
      round.outcome,
      round.claim,
      round.entryTxHash,
    ]
      .map(escape)
      .join(","),
  );
  return [HEADERS.join(","), ...lines].join("\n");
}
