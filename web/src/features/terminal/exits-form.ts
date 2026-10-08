/**
 * The TP/SL drawer's linked inputs (Tradash `sV`/`sq`, RV-51) on Mitoshi's definition (D-200): every target is an exit
 * value — what Close pays — and the three modes are views of it. ROI % is on the stake, P&L is dollars over the stake,
 * and Change % is the asset's move from entry, priced through the reprice model (so a trigger price is "≈"). Integers
 * for money; the model's spots are numbers.
 */
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { formatPrice, formatUsd, priceDecimals } from "./chart/engine";
import { TERMINAL } from "./copy";
import { money, USD_DECIMALS } from "./format";

export type ExitMode = "roi" | "change" | "pnl";
export type ExitKind = "tp" | "sl";
export const EXIT_MODES: readonly ExitMode[] = ["roi", "change", "pnl"];

export interface ExitCtx {
  costBase: bigint;
  /** What the position pays if it wins: one collateral unit per contract (`estPayoutBase`, gross). */
  maxBase: bigint;
  /** What Close pays now; null before the first book read. */
  nowBase: bigint | null;
  /** Change %'s reference: the entry spot, else the spot now. */
  refSpot: number | null;
  valueAt: (spot: number) => bigint | null;
  spotAt: (base: bigint) => number | null;
}

/** Typed text as a signed decimal: true minus, "+", "%", "$", grouping and spaces allowed. */
const clean = (text: string) => text.trim().replace(/[−–]/g, "-").replace(/[%$+,\s]/g, "");

/** A typed trigger price → the exit-value target, or null when it doesn't parse or the model can't price it. */
export function targetFromPrice(text: string, ctx: ExitCtx): bigint | null {
  const spot = Number(clean(text));
  return clean(text) && Number.isFinite(spot) && spot > 0 ? ctx.valueAt(spot) : null;
}

/** A typed mode value → the exit-value target, or null when it doesn't parse or the model can't price it. */
export function targetFromMode(mode: ExitMode, text: string, ctx: ExitCtx): bigint | null {
  const t = clean(text);
  if (!t) return null;
  if (mode === "pnl") {
    const negative = t.startsWith("-");
    const b = parseDecimalToBaseUnits(negative ? t.slice(1) : t, USD_DECIMALS);
    return b === null ? null : ctx.costBase + (negative ? -b : b);
  }
  const pct = Number(t);
  if (!Number.isFinite(pct)) return null;
  if (mode === "roi") return (ctx.costBase * BigInt(Math.round((100 + pct) * 100))) / 10_000n;
  return ctx.refSpot === null ? null : ctx.valueAt(ctx.refSpot * (1 + pct / 100));
}

const signedFixed = (n: number, dp: number) => (n < 0 ? "-" : "") + Math.abs(n).toFixed(dp);

/** The target shown in a mode's input (ASCII minus, the unit outside the field). */
export function modeText(mode: ExitMode, base: bigint | null, ctx: ExitCtx): string {
  if (base === null) return "";
  if (mode === "pnl") {
    const d = base - ctx.costBase;
    return (d < 0n ? "-" : "") + formatBaseUnits(d < 0n ? -d : d, USD_DECIMALS, { group: false, minDp: 2, maxDp: 2 });
  }
  if (mode === "roi") return ctx.costBase > 0n ? signedFixed(Number(((base - ctx.costBase) * 10_000n) / ctx.costBase) / 100, 1) : "";
  const spot = ctx.spotAt(base);
  return spot === null || ctx.refSpot === null ? "" : signedFixed((spot / ctx.refSpot - 1) * 100, 2);
}

export function priceText(base: bigint | null, ctx: ExitCtx): string {
  const spot = base === null ? null : ctx.spotAt(base);
  return spot === null ? "" : formatPrice(spot, priceDecimals(spot)).replace(/,/g, "");
}

/** Tradash's validation (`sq`) in exit-value terms; null when the target is fine or unset. */
export function exitError(kind: ExitKind, base: bigint | null, typed: boolean, ctx: ExitCtx): string | null {
  const e = TERMINAL.exits.errors;
  if (base === null) return typed ? e.enter : null;
  if (kind === "tp") {
    if (base <= ctx.costBase) return e.tpBelow;
    if (base > ctx.maxBase) return e.tpUnreachable(money(ctx.maxBase));
    if (ctx.nowBase !== null && ctx.nowBase >= base) return e.passed;
    return null;
  }
  if (base >= ctx.costBase) return e.slAbove;
  if (base <= 0n) return e.slZero;
  if (ctx.nowBase !== null && ctx.nowBase <= base) return e.passed;
  return null;
}

/** "Closes at ≈ $62,410 for +$1.20 (+24.0%)", or Tradash's "Not set" lines. */
export function exitCaption(kind: ExitKind, base: bigint | null, ctx: ExitCtx): string {
  if (base === null) return kind === "tp" ? TERMINAL.exits.notSetTp : TERMINAL.exits.notSet;
  const pnl = base - ctx.costBase;
  const roi = ctx.costBase > 0n ? Number((pnl * 10_000n) / ctx.costBase) / 100 : 0;
  const roiText = `${roi < 0 ? "−" : "+"}${Math.abs(roi).toFixed(1)}%`;
  const spot = ctx.spotAt(base);
  return spot === null ? TERMINAL.exits.closesWhen(money(base), money(pnl, true), roiText) : TERMINAL.exits.closesAt(formatUsd(spot, priceDecimals(spot)), money(pnl, true), roiText);
}
