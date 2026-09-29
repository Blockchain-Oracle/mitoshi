// Ported from Masayume 68f7a09:packages/core/src/vault/caps.test.ts
import { describe, expect, it } from "vitest";
import type { Address } from "../types/primitives";
import { simulateCaps, utcDayOf } from "./caps";
import type { VaultGrant } from "./types";

const ONE = 1_000_000n;
const FILL_YES = 600_000n;
const NOW_SEC = 1_788_400_000;

interface Vector {
  name: string;
  caps: { maxStakePerTrade: string; maxDailySpend: string; maxOpenPositions: number; maxPriceRaw: string };
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
      const verdict = simulateCaps({ grant: grantFor(v), nowSec: NOW_SEC, sidePriceRaw: sidePrice(v.order.outcomeIdx, limit), quantityRaw, spendBase, one: ONE, opensNewPosition });
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
