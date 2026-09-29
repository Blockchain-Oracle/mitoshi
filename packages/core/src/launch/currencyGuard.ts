/**
 * The launchpad currency-code guard (plan B.5.1, D-025; parity LP-02). Pure; the on-chain twin is
 * `LaunchRegistry.isReservedCode` + `contracts/src/launch/ReservedCodes.sol`, generated from the same
 * `reserved-codes.json` (ISO 4217 List One + the 195 Robinhood Stock Token tickers + "USD").
 *
 * Why it matters: a TIP-20's `currency` is fixed at creation. "USD" makes a coin usable for fees and listable on the
 * enshrined DEX against pathUSD; any other code makes both impossible, forever. So a stablecoin launch is locked to
 * "USD" behind a typed confirmation, and a memecoin (currency = its symbol) may not squat a fiat code or a stock ticker.
 */
import codes from "./reserved-codes.json";

/** The enshrined DEX's minimum order (base units) and tick grid (`IStablecoinDEX`). */
export const DEX_MIN_ORDER = 100_000_000n;
export const DEX_TICK_SPACING = 10;
export const DEX_MAX_TICK = 2_000;
/** TIP-20 `logoURI` and our registry `metadataURI` byte caps. */
export const URI_MAX_BYTES = 256;
/** Codes compare as ≤ 8 ASCII bytes, uppercase — the same key the registry builds. */
export const CODE_MAX_BYTES = 8;

const RESERVED: ReadonlySet<string> = new Set(codes.all);

/** ASCII-only uppercase (a–z → A–Z), leaving every other byte alone — exactly the registry's `_key`. */
export function normalizeCode(code: string): string {
  return code.replace(/[a-z]/g, (c) => c.toUpperCase());
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** Mirrors `LaunchRegistry.isReservedCode`: empty → reserved; longer than 8 bytes → not matchable (false). */
export function isReservedCode(code: string): boolean {
  if (utf8Length(code) > CODE_MAX_BYTES) return false;
  if (code === "") return true;
  return RESERVED.has(normalizeCode(code));
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** A stablecoin's currency is "USD" and nothing else (the wizard shows it locked). */
export function checkStablecoinCurrency(currency: string): GuardResult {
  return currency === "USD" ? { ok: true } : { ok: false, reason: `a stablecoin's currency must be "USD" (got "${currency}"); it cannot be changed later` };
}

/** The typed confirmation on the review step: the creator types the code exactly (case-sensitive). */
export function typedConfirmationMatches(typed: string, currency: string): boolean {
  return typed === currency;
}

/** A memecoin's currency is its symbol: 1–8 ASCII letters/digits, not a reserved code. */
export function checkMemecoinCurrency(symbol: string): GuardResult {
  if (!/^[A-Za-z0-9]{1,8}$/.test(symbol)) return { ok: false, reason: "use 1–8 letters or digits" };
  if (isReservedCode(symbol)) return { ok: false, reason: `"${normalizeCode(symbol)}" is a currency or stock ticker and is reserved` };
  return { ok: true };
}

export interface StablecoinLaunchInput {
  name: string;
  symbol: string;
  currency: string;
  logoURI: string;
  metadataURI: string;
  /** 0n = keep the default cap (uint128 max). */
  supplyCap: bigint;
  initialSupply: bigint;
  /** Base units the bid buys and the ask sells. */
  bidAmount: bigint;
  askAmount: bigint;
  bidTick: number;
  askTick: number;
  /** pathUSD deposited into the FeeAMM (validator side). */
  feeLiquidity: bigint;
}

/** Every rule the batch would otherwise revert on, checked before signing. Empty = launchable. */
export function validateStablecoinLaunch(p: StablecoinLaunchInput): string[] {
  const errors: string[] = [];
  const currency = checkStablecoinCurrency(p.currency);
  if (!currency.ok) errors.push(currency.reason);
  if (p.name.trim() === "") errors.push("name is required");
  if (p.symbol.trim() === "") errors.push("symbol is required");
  if (utf8Length(p.logoURI) > URI_MAX_BYTES) errors.push(`logo URI is over ${URI_MAX_BYTES} bytes`);
  if (utf8Length(p.metadataURI) > URI_MAX_BYTES) errors.push(`metadata URI is over ${URI_MAX_BYTES} bytes`);
  if (p.initialSupply <= 0n) errors.push("initial supply must be positive");
  if (p.supplyCap !== 0n && p.supplyCap < p.initialSupply) errors.push("supply cap is below the initial supply");
  if (p.bidAmount < DEX_MIN_ORDER || p.askAmount < DEX_MIN_ORDER) errors.push("each flip order must be at least 100 tokens (the DEX minimum)");
  if (p.askAmount > p.initialSupply) errors.push("the ask can't sell more than the initial supply");
  for (const [label, t] of [["bid", p.bidTick], ["ask", p.askTick]] as const) {
    if (!Number.isInteger(t) || t % DEX_TICK_SPACING !== 0 || Math.abs(t) > DEX_MAX_TICK) errors.push(`${label} tick must be a multiple of ${DEX_TICK_SPACING} within ±${DEX_MAX_TICK}`);
  }
  if (p.bidTick >= p.askTick) errors.push("the bid must sit below the ask");
  if (p.feeLiquidity <= 0n) errors.push("fee liquidity must be positive so the coin can pay fees");
  return errors;
}

/** pathUSD the bid escrows: `ceil(amount × (100000 + tick) / 100000)` (DEX price = 1 + tick/100000). */
export function bidEscrow(amount: bigint, tick: number): bigint {
  const price = 100_000n + BigInt(tick);
  return (amount * price + 99_999n) / 100_000n;
}
