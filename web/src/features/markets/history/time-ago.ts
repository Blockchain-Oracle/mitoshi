// Ported from Owarine 90a91d71:web/src/features/markets/history/time-ago.ts (R4-4, D-227).
const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The reference's own relative-time ladder for a ledger row (`Portfolio624Section` `ago`). */
export function timeAgo(thenMs: number, nowMs: number): string {
  const delta = nowMs - thenMs;
  if (delta < MIN_MS) return "just now";
  if (delta < HOUR_MS) return `${Math.floor(delta / MIN_MS)}m ago`;
  if (delta < DAY_MS) return `${Math.floor(delta / HOUR_MS)}h ago`;
  return `${Math.floor(delta / DAY_MS)}d ago`;
}
