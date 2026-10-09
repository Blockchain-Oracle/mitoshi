import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { activityFloorBlock, activityRows, counterpartiesOf, type TokenTransfer } from "./transfers";

const ME = "0x00000000000000000000000000000000000000aa" as Address;
const FRIEND = "0x00000000000000000000000000000000000000bb" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const FEE = "0xfeEC000000000000000000000000000000000000" as Address;
const cp = counterpartiesOf(42431);
const [VAULT] = [...cp.balances] as Address[];
const [ENGINE] = [...cp.trading] as Address[];

let n = 0;
const t = (block: number, tx: string, from: Address, to: Address, value: bigint): TokenTransfer => ({
  blockNumber: BigInt(block), logIndex: n++, txHash: tx.padEnd(66, "0") as Hex, atSec: BigInt(block), from, to, valueBase: value,
});

describe("activityRows", () => {
  it("names each move by its counterparty, newest first, and folds the fee into its own transaction", () => {
    const rows = activityRows([
      t(1, "0x01", ZERO, ME, 1_000_000_000_000n),
      t(2, "0x02", ME, VAULT!, 50_000_000n),
      t(3, "0x03", ME, FRIEND, 5_000_000n),
      t(3, "0x03", ME, FEE, 300n),
      t(3, "0x03", FEE, ME, 100n),
      t(4, "0x04", VAULT!, ME, 20_000_000n),
      t(5, "0x05", FRIEND, ME, 1_000_000n),
    ], ME, cp);
    expect(rows.map((r) => [r.kind, r.amountBase, r.feeBase])).toEqual([
      ["received", 1_000_000n, 0n],
      ["from-balance", 20_000_000n, 0n],
      ["sent", 5_000_000n, 200n],
      ["to-balance", 50_000_000n, 0n],
      ["faucet", 1_000_000_000_000n, 0n],
    ]);
    expect(rows.find((r) => r.kind === "sent")!.counterparty).toBe(FRIEND);
    expect(rows.find((r) => r.kind === "faucet")!.counterparty).toBeNull();
  });

  it("leaves trades to Trade history, fee and all, and keeps a fee that paid for nothing else", () => {
    const rows = activityRows([
      t(1, "0x11", ME, ENGINE!, 1_000_000n),
      t(1, "0x11", ME, FEE, 250n),
      t(2, "0x12", ENGINE!, ME, 2_000_000n),
      t(3, "0x13", ME, FEE, 150n),
    ], ME, cp);
    expect(rows.map((r) => [r.kind, r.amountBase])).toEqual([["fee", 150n]]);
  });
});

describe("counterpartiesOf / activityFloorBlock", () => {
  it("knows both Trading Balance generations and starts at Mitoshi's first deployment", () => {
    expect(cp.balances.has("0xdbb3fa8667351df47f54b1d8ea9b44b28b9c2040")).toBe(true);
    expect(cp.balances.has("0x6f05b0dcaa31c241a4f6e8ceb170090b41679e95")).toBe(true);
    expect(cp.trading.has("0xdbb3fa8667351df47f54b1d8ea9b44b28b9c2040")).toBe(false);
    expect(activityFloorBlock(42431)).toBeGreaterThan(37_000_000n);
    expect(activityFloorBlock(1)).toBeNull();
  });
});
