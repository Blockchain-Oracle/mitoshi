/** D-230: the untouched stake is 5 % of what you can spend, at most $10 — never $50,000 on a new $1M account. */
import { describe, expect, it } from "vitest";
import { wantedStakeBase } from "./settings";

const usd = (n: number) => BigInt(Math.round(n * 1_000_000));
const MIN = usd(1);
const auto = (spendable: number | null) => wantedStakeBase({ sizeBase: null }, spendable === null ? null : usd(spendable), MIN);

describe("the terminal's default stake", () => {
  it("follows 5 % of what you can spend, at most $10, in whole cents, never under the minimum", () => {
    expect(auto(1_000_000)).toBe(usd(10));
    expect(auto(10_000)).toBe(usd(10));
    expect(auto(100)).toBe(usd(5));
    expect(auto(123.45)).toBe(usd(6.17));
    expect(auto(15)).toBe(MIN);
    expect(auto(null)).toBe(MIN);
  });

  it("is the user's own size once set, whatever it is", () => {
    expect(wantedStakeBase({ sizeBase: usd(250).toString() }, usd(1_000_000), MIN)).toBe(usd(250));
  });
});
