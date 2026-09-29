import { describe, expect, it } from "vitest";
import codes from "./reserved-codes.json";
import { bidEscrow, checkMemecoinCurrency, checkStablecoinCurrency, isReservedCode, normalizeCode, typedConfirmationMatches, validateStablecoinLaunch, type StablecoinLaunchInput } from "./currencyGuard";

const good: StablecoinLaunchInput = {
  name: "Acme Dollar",
  symbol: "ACMEUSD",
  currency: "USD",
  logoURI: "https://mitoshi.xyz/logos/acme.png",
  metadataURI: "ipfs://bafy-acme",
  supplyCap: 1_000_000_000_000n,
  initialSupply: 10_000_000_000n,
  bidAmount: 100_000_000n,
  askAmount: 100_000_000n,
  bidTick: -10,
  askTick: 10,
  feeLiquidity: 1_000_000_000n,
};

describe("reserved codes (same cases as LaunchRegistry.t.sol)", () => {
  it("come from ISO 4217 + 195 Stock Token tickers + USD", () => {
    expect(codes.stockTokens).toHaveLength(195);
    expect(codes.iso4217.length).toBeGreaterThan(150);
    expect(codes.all).toContain("USD");
    expect([...codes.all].sort()).toEqual(codes.all);
  });

  it("reserve fiat, stock tickers and the empty code, case-insensitively", () => {
    for (const c of ["USD", "usd", "EUR", "Jpy", "XAU", "TSLA", "tsla", "GOOGL", "SPY", ""]) expect(isReservedCode(c), c).toBe(true);
  });

  it("leave free codes and anything over 8 bytes unreserved", () => {
    for (const c of ["MEOW", "PEPE", "USDX", "TSLAX", "ABCDEFGHI"]) expect(isReservedCode(c), c).toBe(false);
  });

  it("uppercase ASCII only", () => {
    expect(normalizeCode("aBc9é")).toBe("ABC9é");
  });
});

describe("stablecoin guard", () => {
  it("locks the currency to USD with a typed, case-sensitive confirmation", () => {
    expect(checkStablecoinCurrency("USD").ok).toBe(true);
    expect(checkStablecoinCurrency("usd").ok).toBe(false);
    expect(checkStablecoinCurrency("EUR").ok).toBe(false);
    expect(typedConfirmationMatches("USD", "USD")).toBe(true);
    expect(typedConfirmationMatches("usd", "USD")).toBe(false);
  });

  it("accepts the sub-gate launch", () => {
    expect(validateStablecoinLaunch(good)).toEqual([]);
  });

  it("names every rule the batch would revert on", () => {
    const bad = validateStablecoinLaunch({ ...good, currency: "EUR", bidAmount: 99_999_999n, supplyCap: 1n, bidTick: 15, askTick: -10, feeLiquidity: 0n });
    expect(bad.join(" | ")).toMatch(/must be "USD"/);
    expect(bad.join(" | ")).toMatch(/DEX minimum/);
    expect(bad.join(" | ")).toMatch(/supply cap is below/);
    expect(bad.join(" | ")).toMatch(/multiple of 10/);
    expect(bad.join(" | ")).toMatch(/bid must sit below the ask/);
    expect(bad.join(" | ")).toMatch(/fee liquidity/);
  });

  it("computes the bid's pathUSD escrow like the DEX (100 tokens at 0.9999 = 99.99)", () => {
    expect(bidEscrow(100_000_000n, -10)).toBe(99_990_000n);
    expect(bidEscrow(100_000_000n, 0)).toBe(100_000_000n);
  });
});

describe("memecoin guard", () => {
  it("refuses fiat codes and stock tickers, allows free symbols", () => {
    expect(checkMemecoinCurrency("MEOW").ok).toBe(true);
    expect(checkMemecoinCurrency("NVDA").ok).toBe(false);
    expect(checkMemecoinCurrency("eur").ok).toBe(false);
    expect(checkMemecoinCurrency("TOO-LONG!").ok).toBe(false);
  });
});
