// Ported from Masayume 68f7a09:packages/core/src/x/grant-policy.test.ts
import { describe, expect, it } from "vitest";
import { simulateCaps, type VaultGrant } from "../vault";
import { isBalanceOnlyXGrant, xGrantCaps, xPermissionState } from "./grant-policy";

const actor = `0x${"11".repeat(20)}` as const;
const grant: VaultGrant = { grantId: 10n, owner: actor, actor, kind: "executor", revoked: false, expiresAtSec: 2000,
  spentDay: 0, spentTodayBase: 0n, openPositions: 0, caps: xGrantCaps(), budgetBase: 55_000_000n };
const check = (g: VaultGrant, spendBase: bigint) => simulateCaps({ grant: g, nowSec: 1000, sidePriceRaw: 500_000n,
  quantityRaw: spendBase * 2n, spendBase, one: 1_000_000n, opensNewPosition: true });

describe("X allocated-balance policy", () => {
  it("allows two 25 tUSDC trades after a 5 initial allocation is topped up to 55 on the same day", () => {
    expect(check(grant, 25_000_000n).ok).toBe(true);
    const second = { ...grant, budgetBase: 30_000_000n, spentTodayBase: 25_000_000n, openPositions: 1 };
    expect(check(second, 25_000_000n).ok).toBe(true);
    expect(check({ ...second, budgetBase: 5_000_000n, spentTodayBase: 50_000_000n }, 6_000_000n)).toMatchObject({ ok: false, refusal: { kind: "escrow" } });
  });
  it("retains expiry, revocation and open-position protection", () => {
    expect(check({ ...grant, revoked: true }, 1n)).toMatchObject({ ok: false, refusal: { kind: "revoked" } });
    expect(check({ ...grant, expiresAtSec: 999 }, 1n)).toMatchObject({ ok: false, refusal: { kind: "expired" } });
    expect(check({ ...grant, openPositions: 8 }, 1n)).toMatchObject({ ok: false, refusal: { kind: "positions" } });
  });
  it("requires updates for old monetary caps regardless of remaining balance", () => {
    const old = { ...grant, caps: { ...grant.caps, maxStakePerTradeBase: 5_000_000n, maxDailySpendBase: 5_000_000n } };
    expect(isBalanceOnlyXGrant(old)).toBe(false);
    expect(xPermissionState(old, actor, 1000)).toBe("update");
    expect(xPermissionState({ ...old, budgetBase: 0n }, actor, 1000)).toBe("update");
    expect(xPermissionState(grant, actor, 1000)).toBe("ready");
    expect(xPermissionState({ ...grant, expiresAtSec: 1000 }, actor, 1000)).toBe("expired");
    expect(xPermissionState(grant, `0x${"22".repeat(20)}`, 1000)).toBe("mismatch");
    expect(xPermissionState(grant, null, 1000)).toBe("unavailable");
  });
});
