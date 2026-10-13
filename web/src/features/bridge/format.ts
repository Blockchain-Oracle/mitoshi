/** Figures for /bridge and /reserves (R4-12, D-227): integer base units in, display strings out — never a float. */
import { formatBaseUnits, SHARED_DECIMALS } from "@cwf/core";

/** A 6-dp shared amount (a mirror, or a Robinhood amount after dust): "25", "25.5", "1,000". */
export const sd = (v: bigint, maxDp = 4) => formatBaseUnits(v, SHARED_DECIMALS, { maxDp, minDp: 0 });

/** Wei → "0.0001"-style text (up to 6 dp). */
export const eth = (wei: bigint) => formatBaseUnits(wei, 18, { maxDp: 6, minDp: 0 });

/** A fee in wei, rounded up to the 6 dp shown — a fee is never shown smaller than it is. */
export const ethUp = (wei: bigint) => eth(((wei + 10n ** 12n - 1n) / 10n ** 12n) * 10n ** 12n);

/** An ERC-8056 multiplier (1e18 = 1.00). */
export const multiplier = (e18: bigint) => formatBaseUnits(e18, 18, { maxDp: 2, minDp: 2 });

export const blockText = (n: bigint | string) => BigInt(n).toLocaleString("en-US");

/** "12 s", "4 min", "3 h", "2 d" — whole units, rounded down. */
export function span(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86_400)} d`;
}

/** "0:42" / "12:05" — an elapsed timer. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
