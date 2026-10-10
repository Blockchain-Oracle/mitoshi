// The settled record Sensei's brake reads (S13 step 8), from the wallet's indexed rounds.
import type { SenseiRecord } from "./protocol";

/** Settled rounds, oldest first: a win made money, a loss lost it; the streak runs back from the newest decided one. */
export function recordOf(rounds: readonly { expirySec: number; pnlBase: bigint }[]): SenseiRecord {
  const decided = [...rounds].filter((r) => r.pnlBase !== 0n).sort((a, b) => a.expirySec - b.expirySec);
  const wins = decided.filter((r) => r.pnlBase > 0n).length;
  let streak = 0;
  for (let i = decided.length - 1; i >= 0; i--) {
    const won = decided[i]!.pnlBase > 0n;
    if (streak === 0) streak = won ? 1 : -1;
    else if (won === streak > 0) streak += won ? 1 : -1;
    else break;
  }
  return { settled: rounds.length, wins, losses: decided.length - wins, streak };
}
