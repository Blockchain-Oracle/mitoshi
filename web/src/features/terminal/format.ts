// Ported from Owarine ecb7565b:web/src/features/terminal/format.ts — amounts are pathUSD (6 decimals) shown as dollars
// ("$24.54", "+$3.76"); a right call's multiple is 1000 ÷ the ask in ticks (Mitoshi's price unit: 1 tick = 0.1¢).
import type { Side } from "@cwf/core";

/** pathUSD and the vault's units carry six decimals. */
export const USD_DECIMALS = 6;

/**
 * Decimals by magnitude (Tradash's rule) — 4 under 10, 3 under 1,000, 2 above, 1 from 100,000 — so a small live PnL
 * keeps its motion.
 */
export function moneyDecimals(value: number): number {
  const a = Math.abs(value);
  if (a >= 1e5) return 1;
  if (a >= 1e3) return 2;
  if (a >= 10) return 3;
  return 4;
}

/**
 * `|value|` at `dp` decimals, rounding half up on the decimal value the screen shows — so 191.475 reads "191.48" here
 * as it does on the odometer, where `toFixed` would see the double 191.47499… and print "191.47".
 */
export function fixedText(value: number, dp: number): string {
  const scaled = Number((Math.abs(value) * 10 ** dp).toPrecision(12));
  return (Math.round(scaled) / 10 ** dp).toFixed(dp);
}

const grouped = (n: number, dp: number) => Number(fixedText(n, dp)).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Base units → "$24.54", or signed with a true minus ("+$3.76" / "−$5.74") when `signed`; 2 dp (settled figures). */
export function money(base: bigint, signed = false, decimals = USD_DECIMALS): string {
  const n = Number(base) / 10 ** decimals;
  if (!signed) return `$${grouped(n, 2)}`;
  return `${n < 0 ? "−" : "+"}$${grouped(n, 2)}`;
}

/** A live PnL in base units, signed at the magnitude decimals ("+$0.0412", "+$12.345", "−$1,204.50"), so it keeps moving. */
export function livePnlText(base: bigint, decimals = USD_DECIMALS): string {
  const n = Number(base) / 10 ** decimals;
  return `${n < 0 ? "−" : "+"}$${grouped(n, moneyDecimals(n))}`;
}

/** What a right call pays per dollar staked at an ask of `ticks` (1–999): 1000 ÷ ticks, as "1.9×". */
export function multipleOf(ticks: number): string {
  if (!(ticks > 0)) return "–";
  const m = 1000 / ticks;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(2).replace(/0$/, "")}×`;
}

/** An ask in ticks as cents: 523 → "52.3¢". */
export const centsOf = (ticks: number): string => `${(ticks / 10).toFixed(ticks % 10 === 0 ? 0 : 1)}¢`;

export const sideWord = (side: Side): "Up" | "Down" => (side === "up" ? "Up" : "Down");

/** "1:05" / "12s" until a moment. */
export function untilText(targetSec: number, nowSec: number): string {
  const s = Math.max(0, Math.round(targetSec - nowSec));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export const clockText = (sec: number): string => new Date(sec * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
