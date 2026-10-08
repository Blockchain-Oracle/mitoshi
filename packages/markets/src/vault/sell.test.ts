import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import type { MarketId } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { yesTicksOf } from "../engine/calls";
import { bookVaultSale } from "./sell";

const VAULT = "0x00000000000000000000000000000000000000aa" as Address;
const OWNER = "0x00000000000000000000000000000000000000bb" as Address;
const ACTOR = "0x00000000000000000000000000000000000000cc" as Address;
const MARKET = `0x${"12".repeat(32)}` as MarketId;
const TX = `0x${"ef".repeat(32)}` as Hex;

function executed(o: { grantId: bigint; isBuy: boolean; cash: bigint; tokens: bigint; owner?: Address }) {
  const topics = encodeEventTopics({ abi: eventVaultAbi, eventName: "Executed", args: { owner: o.owner ?? OWNER, marketId: MARKET, grantId: o.grantId } });
  const data = encodeAbiParameters(
    [{ type: "uint8" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint64" }],
    [1, o.isBuy, o.cash, o.tokens, ACTOR, 1_800_000_000n],
  );
  return { address: VAULT, topics, data, blockHash: null, blockNumber: null, logIndex: 0, transactionHash: TX, transactionIndex: 0, removed: false } as never;
}

describe("the Trading Balance's sell lane", () => {
  it("books the sale from the vault's own Executed event: the owner's, this grant's, a sell", () => {
    const logs = [executed({ grantId: 7n, isBuy: true, cash: 1n, tokens: 1n }), executed({ grantId: 7n, isBuy: false, cash: 4_100_000n, tokens: 8_000_000n })];
    expect(bookVaultSale(logs, VAULT, OWNER, MARKET, 7n, "down", TX)).toEqual({ marketId: MARKET, side: "down", contractsRaw: 8_000_000n, proceedsBase: 4_100_000n, avgPriceBps: 5_125, txHash: TX, fillCount: 1 });
  });
  it("finds nothing for another grant, another owner, or an empty fill", () => {
    expect(bookVaultSale([executed({ grantId: 8n, isBuy: false, cash: 1n, tokens: 1n })], VAULT, OWNER, MARKET, 7n, "up", TX)).toBeNull();
    expect(bookVaultSale([executed({ grantId: 7n, isBuy: false, cash: 1n, tokens: 1n, owner: ACTOR })], VAULT, OWNER, MARKET, 7n, "up", TX)).toBeNull();
    expect(bookVaultSale([executed({ grantId: 7n, isBuy: false, cash: 0n, tokens: 0n })], VAULT, OWNER, MARKET, 7n, "up", TX)).toBeNull();
  });
  it("prices a Down sale in YES ticks, as the vault hands the engine", () => {
    expect(yesTicksOf("down", 480)).toBe(520);
    expect(yesTicksOf("up", 480)).toBe(480);
  });
});
