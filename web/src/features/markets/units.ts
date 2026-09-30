/**
 * Prices on screen (Masayume 68f7a09:web/src/features/markets/hero/units.ts, rebuilt): every print and tick on Tempo is
 * a signed 1e-8 price (RedStone `priceE8`, engine `Print.priceE8`), so one scale serves the line, the chart and the
 * cards — they can never quote different numbers. Integers until the canvas boundary.
 */
import type { EventMarket } from "@cwf/core";
import { formatOracleRaw } from "@cwf/core/units";

export const PRICE_SCALE = 8;

/** The ops feed a Window settles on: a 24/7 stock lane reads the provider's `-24` feed; everything else its ticker. */
export function feedKeyOf(market: Pick<EventMarket, "asset" | "lane">): string {
  return market.lane === "stock24" ? `${market.asset}-24` : market.asset;
}

/** "$64,210" — the headline's whole dollars (Yosuku `fmtUsd0`); sub-$10 prices keep cents. */
export function usd0(raw: bigint): string {
  const dp = raw < 10n * 10n ** BigInt(PRICE_SCALE) ? 2 : 0;
  return `$${formatOracleRaw(raw, PRICE_SCALE, dp)}`;
}

/** "$64,210.37" — two decimals (the chart readout, the legend, receipts). */
export function usd2(raw: bigint): string {
  return `$${formatOracleRaw(raw < 0n ? -raw : raw, PRICE_SCALE, 2)}`;
}

export function usdText(raw: bigint | null): string {
  return raw === null ? "—" : usd2(raw);
}

/** Floats exist only at the canvas boundary. */
export const toChartValue = (raw: bigint): number => Number(raw) / 10 ** PRICE_SCALE;
