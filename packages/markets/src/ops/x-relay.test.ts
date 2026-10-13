// The executor's limits (S11, D-227): an X order spends exactly what the mention named, only from the account's
// EXECUTOR grant, and every grant check `placeFor` would fail is refused here, by its public reason, before any send.
import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address, type Hex } from "viem";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { xGrantCaps, type VaultGrant } from "@cwf/core";
import type { RunnerWindow } from "./strategy-runner";
import { capRefusalCode, xOrder, xVenueOf } from "./x-relay";

const xv = xVenueOf(42431)!;
const NOW = 1_791_700_000;
const MARKET = `0x${"ab".repeat(32)}` as Hex;
const window: RunnerWindow = {
  marketId: MARKET, seriesId: `0x${"7c".repeat(32)}`, index: 10n, spotSymbol: "BTC", cadenceSec: 300, tradingStartSec: NOW - 60, lockAtSec: NOW + 240, expirySec: NOW + 240, openPriceE8: 6_000_000_000_000n,
  grid: { lotBase: 1_000n, tickBase: 1_000n, cashUnit: 1n, minLots: 1n, decimals: 6 },
};
const book = { bids: [[380, 100_000n]] as [number, bigint][], asks: [[600, 100_000n]] as [number, bigint][] };
const EXECUTOR = "0x102229bcadb723d81a63167a962490a21daf08fc" as Address;
const grant = (over: Partial<VaultGrant> = {}): VaultGrant => ({
  grantId: 21n, owner: "0x1ef9d7ec85393f9b68dca8980d266b574cc2ac18" as Address, actor: EXECUTOR, kind: "executor", revoked: false,
  expiresAtSec: NOW + 30 * 86_400, spentDay: 0, spentTodayBase: 0n, openPositions: 0, budgetBase: 20_000_000n, caps: xGrantCaps(), ...over,
});
const order = (g: VaultGrant, stakeBase = 5_000_000n, side: "up" | "down" = "up", held = { up: 0n, down: 0n }) =>
  xOrder(xv, { grant: g, window, side, stakeBase, book, held, nowSec: NOW, nowMs: NOW * 1000 });

describe("xOrder (S11)", () => {
  it("places exactly the named stake through the EXECUTOR grant, on the current Trading Balance", () => {
    const o = order(grant());
    if (!o.ok) throw new Error(o.why);
    expect(o.call.to).toBe(xv.vault);
    const { functionName, args } = decodeFunctionData({ abi: eventVaultV2Abi, data: o.call.data });
    expect(functionName).toBe("placeFor");
    const [grantId, marketId, outcomeIdx, isBuy, priceRaw, quantityRaw] = args as unknown as [bigint, Hex, number, boolean, bigint, bigint];
    expect([grantId, marketId, outcomeIdx, isBuy]).toEqual([21n, MARKET, 0, true]);
    expect((quantityRaw * priceRaw) / 1_000_000n).toBeLessThanOrEqual(5_000_000n);
    expect(o.quote.stakeBase).toBe(5_000_000n);
  });

  it("refuses more than the X balance instead of shrinking it", () => {
    expect(order(grant({ budgetBase: 4_000_000n }))).toEqual({ ok: false, code: "insufficient-funds", why: "more than the X balance" });
  });

  it("names every grant refusal by its public code", () => {
    expect(order(grant({ revoked: true }))).toMatchObject({ ok: false, code: "grant-missing" });
    expect(order(grant({ expiresAtSec: NOW - 1 }))).toMatchObject({ ok: false, code: "grant-expired" });
    expect(order(grant({ openPositions: 8 }))).toMatchObject({ ok: false, code: "position-limit" });
    expect(order(grant({ caps: { ...xGrantCaps(), maxPriceRaw: 500_000n } }))).toMatchObject({ ok: false, code: "price-limit" });
    expect(order(grant({ caps: { ...xGrantCaps(), maxStakePerTradeBase: 1_000_000n } }))).toMatchObject({ ok: false, code: "grant-update-required" });
    expect(order(grant({ caps: { ...xGrantCaps(), market: `0x${"cd".repeat(32)}` as never } }))).toMatchObject({ ok: false, code: "permission-denied" });
  });

  it("does not count a second call in a Window it already holds against the position cap", () => {
    expect(order(grant({ openPositions: 8 }), 5_000_000n, "up", { up: 1n, down: 0n }).ok).toBe(true);
  });

  it("refuses an empty book and the no-entry buffer, and buys NO for DOWN", () => {
    expect(xOrder(xv, { grant: grant(), window, side: "down", stakeBase: 1_000_000n, book: { bids: [], asks: [] }, held: { up: 0n, down: 0n }, nowSec: NOW, nowMs: NOW * 1000 })).toMatchObject({ ok: false, code: "no-liquidity" });
    expect(xOrder(xv, { grant: grant(), window, side: "up", stakeBase: 1_000_000n, book: null, held: { up: 0n, down: 0n }, nowSec: NOW, nowMs: NOW * 1000 })).toMatchObject({ ok: false, code: "quote-unavailable" });
    expect(xOrder(xv, { grant: grant(), window: { ...window, lockAtSec: NOW + 20 }, side: "up", stakeBase: 1_000_000n, book, held: { up: 0n, down: 0n }, nowSec: NOW, nowMs: NOW * 1000 })).toMatchObject({ ok: false, code: "window-entry-closed" });
    const down = order(grant(), 1_000_000n, "down");
    if (!down.ok) throw new Error(down.why);
    expect((decodeFunctionData({ abi: eventVaultV2Abi, data: down.call.data }).args as unknown as unknown[])[2]).toBe(1);
  });

  it("maps cap refusals one to one", () => {
    expect(capRefusalCode({ kind: "daily", wouldBeBase: 2n, capBase: 1n })).toBe("grant-update-required");
    expect(capRefusalCode({ kind: "escrow", worstBase: 2n, budgetBase: 1n })).toBe("insufficient-funds");
  });
});
