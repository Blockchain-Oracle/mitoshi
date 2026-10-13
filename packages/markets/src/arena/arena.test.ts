// The arena's call encoding (R4-9, D-227): the money rule — every call that hands the arena the caller's money carries
// an approval of exactly that sum first, and nothing else does — and the refusals that must not reach the chain.
import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { toMarketId, type TxIntent } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { gameArenaAbi } from "@cwf/clients/abis/GameArena";
import { arenaOf } from "./deployment";
import { encodeArenaIntent } from "./encoders";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const OTHER = "0x00000000000000000000000000000000000000b2" as Address;
const KEY = "0x00000000000000000000000000000000000000c3" as Address;
const MATCH = `0x${"d0".repeat(32)}` as const;
const HASH = `0x${"e1".repeat(32)}` as const;
const encode = (intent: TxIntent) => {
  const r = encodeArenaIntent(intent, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error(`not encoded: ${JSON.stringify(r)}`);
  return r.value;
};
const arena = () => arenaOf(CHAIN)!.gameArena.toLowerCase();
const approvalOf = (data: Hex) => decodeFunctionData({ abi: erc20Abi, data }).args as readonly [Address, bigint];
const fn = (data: Hex) => decodeFunctionData({ abi: gameArenaAbi, data });

describe("arena encoders", () => {
  it("reads the deployed arena from the fragment", () => {
    expect(arenaOf(CHAIN)?.gameArena).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(arenaOf(4217)).toBeNull();
  });

  it("approves exactly the pot before an entry, and the pot plus the key's ceiling when a key is named", () => {
    const plain = encode({ kind: "arena-create", matchId: MATCH, challenger: OTHER, tier: 1, deckHash: HASH, deckSize: 3, policyVersion: 1, potBase: 1_000_000n });
    expect(plain.calls).toHaveLength(2);
    expect(plain.calls[0]!.to.toLowerCase()).toBe(TEMPO.pathUSD.toLowerCase());
    expect(approvalOf(plain.calls[0]!.data)).toEqual([arenaOf(CHAIN)!.gameArena, 1_000_000n]);
    expect(fn(plain.calls[1]!.data).functionName).toBe("createMatch");
    expect(plain.sponsored).toBe(false);

    const keyed = encode({ kind: "arena-join", matchId: MATCH, potBase: 5_000_000n, agent: { agent: KEY, ttlSec: 600, budgetBase: 3_000_000n, gasWei: 0n } });
    expect(approvalOf(keyed.calls[0]!.data)[1]).toBe(8_000_000n);
    const join = fn(keyed.calls[1]!.data);
    expect(join.functionName).toBe("joinMatchWithAgent");
    const [m, key, ttl] = join.args as readonly [Hex, Address, number];
    expect([m, key.toLowerCase(), ttl]).toEqual([MATCH, KEY, 600]);
  });

  it("approves a pick's stake for the player's own pick, and nothing for the key's", () => {
    const own = encode({ kind: "arena-pick", matchId: MATCH, cardIndex: 2, pick: "down", stakeBase: 1_000_000n, minQuantityRaw: 0n });
    expect(approvalOf(own.calls[0]!.data)[1]).toBe(1_000_000n);
    expect(fn(own.calls[1]!.data).args).toEqual([MATCH, 2, 1, 1_000_000n, 0n]);
    const forSeat = encode({ kind: "arena-pick-for", player: USER, matchId: MATCH, cardIndex: 0, pick: "up", stakeBase: 1_000_000n, minQuantityRaw: 0n });
    expect(forSeat.calls).toHaveLength(1);
    expect(fn(forSeat.calls[0]!.data).functionName).toBe("placePickFor");
  });

  it("sends the cranks alone, to the arena; the reveal is the settler's and never asks the relay", () => {
    const card = toMarketId(`0x${"a1".repeat(32)}`);
    for (const intent of [
      { kind: "arena-reveal", matchId: MATCH, serverSeed: HASH, clientSeeds: [HASH], cards: [card] },
      { kind: "arena-lock", matchId: MATCH },
      { kind: "arena-settle-card", matchId: MATCH, cardIndex: 1 },
      { kind: "arena-finalize", matchId: MATCH },
      { kind: "arena-claim", player: USER },
    ] as TxIntent[]) {
      const e = encode(intent);
      expect(e.calls).toHaveLength(1);
      expect(e.calls[0]!.to.toLowerCase()).toBe(arena());
      expect(e.sponsored, intent.kind).toBe(intent.kind !== "arena-reveal");
    }
  });

  it("refuses a key grant that asks to carry gas — Tempo has no native value", () => {
    const r = encodeArenaIntent({ kind: "arena-create", matchId: MATCH, challenger: OTHER, tier: 0, deckHash: HASH, deckSize: 3, policyVersion: 1, potBase: 0n, agent: { agent: KEY, ttlSec: 600, budgetBase: 3_000_000n, gasWei: 1n } }, { chainId: CHAIN, wallet: USER });
    expect(r?.ok).toBe(false);
  });

  it("leaves every other area's intent alone", () => {
    expect(encodeArenaIntent({ kind: "noop" }, { chainId: CHAIN, wallet: USER })).toBeNull();
  });
});
