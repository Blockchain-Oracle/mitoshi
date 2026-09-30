// Ported from Masayume 68f7a09:packages/core/src/vault/caps.test.ts — rows carry the D-091 Window scope (`caps.market`).
import { describe, expect, it } from "vitest";
import type { MarketId } from "../types/market";
import type { Address } from "../types/primitives";
import { simulateCaps, utcDayOf } from "./caps";
import type { VaultGrant } from "./types";

const ONE = 1_000_000n;
const FILL_YES = 600_000n;
const NOW_SEC = 1_788_400_000;
/** The order's Window and another listed one (the forge suite lists a second Window for "other"). */
const THIS = `0x${"a1".repeat(32)}` as MarketId;
const OTHER = `0x${"b2".repeat(32)}` as MarketId;

interface Vector {
  name: string;
  caps: { maxStakePerTrade: string; maxDailySpend: string; maxOpenPositions: number; maxPriceRaw: string; market?: "this" | "other" };
  budget: string;
  expired: boolean;
  prior: { outcomeIdx: 0 | 1; priceRaw: string; quantityRaw: string } | null;
  order: { outcomeIdx: 0 | 1; priceRaw: string; quantityRaw: string };
  expect: { ok: true; spendBase: string } | { ok: false; refusal: string; error: string };
}

import golden from "./caps.vectors.json";

const { vectors } = golden as unknown as { vectors: Vector[] };

const sidePrice = (outcomeIdx: 0 | 1, yesPriceRaw: bigint) => (outcomeIdx === 0 ? yesPriceRaw : ONE - yesPriceRaw);
/** The mock book: a buy fills in full when the limit reaches the fill price, at the fill price. */
const charge = (outcomeIdx: 0 | 1, limitYes: bigint, quantityRaw: bigint) =>
  sidePrice(outcomeIdx, limitYes) >= sidePrice(outcomeIdx, FILL_YES) ? (quantityRaw * sidePrice(outcomeIdx, FILL_YES)) / ONE : 0n;

function grantFor(v: Vector): VaultGrant {
  const priorSpend = v.prior ? charge(v.prior.outcomeIdx, BigInt(v.prior.priceRaw), BigInt(v.prior.quantityRaw)) : 0n;
  return {
    grantId: 1n,
    owner: "0x0000000000000000000000000000000000000001" as Address,
    actor: "0x0000000000000000000000000000000000000002" as Address,
    kind: "strategy",
    revoked: false,
    expiresAtSec: v.expired ? NOW_SEC - 1 : NOW_SEC + 86_400,
    spentDay: utcDayOf(NOW_SEC),
    spentTodayBase: priorSpend,
    openPositions: v.prior ? 1 : 0,
    caps: {
      maxStakePerTradeBase: BigInt(v.caps.maxStakePerTrade),
      maxDailySpendBase: BigInt(v.caps.maxDailySpend),
      maxOpenPositions: v.caps.maxOpenPositions,
      maxPriceRaw: BigInt(v.caps.maxPriceRaw),
      market: v.caps.market === "this" ? THIS : v.caps.market === "other" ? OTHER : null,
    },
    budgetBase: BigInt(v.budget) - priorSpend,
  };
}

describe("simulateCaps mirrors EventVault.placeFor on the shared vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      const limit = BigInt(v.order.priceRaw);
      const quantityRaw = BigInt(v.order.quantityRaw);
      const spendBase = charge(v.order.outcomeIdx, limit, quantityRaw);
      const opensNewPosition = !(v.prior && v.prior.outcomeIdx === v.order.outcomeIdx);
      const verdict = simulateCaps({ grant: grantFor(v), nowSec: NOW_SEC, marketId: THIS, sidePriceRaw: sidePrice(v.order.outcomeIdx, limit), quantityRaw, spendBase, one: ONE, opensNewPosition });
      if (v.expect.ok) {
        expect(verdict.ok, `expected ok, got ${JSON.stringify(verdict, (_, x) => (typeof x === "bigint" ? x.toString() : x))}`).toBe(true);
        expect(spendBase).toBe(BigInt(v.expect.spendBase));
      } else if (v.expect.refusal === "venue") {
        // Every cap passes; it is the venue that refuses an IOC with nothing to cross, and the charge would be 0.
        expect(verdict.ok).toBe(true);
        expect(spendBase).toBe(0n);
      } else {
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.refusal.kind).toBe(v.expect.refusal);
      }
    });
  }
});

describe("the D-091 Window scope", () => {
  const base: VaultGrant = {
    grantId: 1n, owner: "0x0000000000000000000000000000000000000001" as Address, actor: "0x0000000000000000000000000000000000000002" as Address,
    kind: "session", revoked: false, expiresAtSec: NOW_SEC + 60, spentDay: utcDayOf(NOW_SEC), spentTodayBase: 0n, openPositions: 0,
    caps: { maxStakePerTradeBase: 5n * ONE, maxDailySpendBase: 25n * ONE, maxOpenPositions: 3, maxPriceRaw: 0n, market: THIS }, budgetBase: 25n * ONE,
  };
  const at = (grant: VaultGrant, marketId: MarketId | null | undefined) =>
    simulateCaps({ grant, nowSec: NOW_SEC, marketId, sidePriceRaw: 500_000n, quantityRaw: 2n * ONE, spendBase: ONE, one: ONE, opensNewPosition: true });

  it("matches the scope case-insensitively (ids arrive checksummed or lower-case)", () => {
    expect(at(base, THIS.toUpperCase().replace("0X", "0x") as MarketId).ok).toBe(true);
  });
  it("refuses a scoped grant when the order's Window is unknown — never assumed to match", () => {
    expect(at(base, undefined)).toMatchObject({ ok: false, refusal: { kind: "market", scope: THIS, marketId: null } });
  });
  it("an unscoped grant acts in any Window, known or not", () => {
    const any = { ...base, caps: { ...base.caps, market: null } };
    expect(at(any, OTHER).ok).toBe(true);
    expect(at(any, undefined).ok).toBe(true);
  });
  it("a revoked or expired grant reports that first, as the contract does", () => {
    expect(at({ ...base, revoked: true }, OTHER)).toMatchObject({ ok: false, refusal: { kind: "revoked" } });
    expect(at({ ...base, expiresAtSec: NOW_SEC - 1 }, OTHER)).toMatchObject({ ok: false, refusal: { kind: "expired" } });
  });
});
