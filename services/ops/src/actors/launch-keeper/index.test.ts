import { describe, expect, it } from "vitest";
import { type Address, type Hex, toFunctionSelector } from "viem";
import { type KeeperDeps, launchKeeperPass, planGraduations } from "./index";

const A = "0x20c0000000000000000000000000000000000a01" as Address;
const B = "0x20c0000000000000000000000000000000000b02" as Address;
const C = "0x20c0000000000000000000000000000000000c03" as Address;
const PAD = "0x00000000000000000000000000000000000000aa" as Address;

function deps(states: Record<Address, number>, poisoned: Address[] = []): KeeperDeps {
  return {
    list: async () => Object.keys(states) as Address[],
    state: async (t) => states[t]!,
    simulate: async (t) => {
      if (poisoned.includes(t)) throw new Error("PoolPoisoned(address)\nmore");
    },
  };
}

describe("launch keeper", () => {
  it("plans exactly the Complete launches", () => {
    expect(planGraduations([{ token: A, state: 1 }, { token: B, state: 2 }, { token: C, state: 3 }])).toEqual([B]);
  });

  it("graduates Complete launches one tx each and skips what simulation refuses", async () => {
    const sent: Hex[] = [];
    const sender = { account: PAD, send: async (calls: { data: Hex }[]) => (sent.push(calls[0]!.data), { hash: "0x01" as Hex, status: "success" as const }) };
    const pass = launchKeeperPass({ deps: deps({ [A]: 2, [B]: 2, [C]: 1 }, [B]), launchpad: PAD, dryRun: false, sender });
    const r = await pass();
    expect(r.outcomes).toEqual([
      { token: A, result: "graduated", hash: "0x01" },
      { token: B, result: "refused", reason: "PoolPoisoned(address)" },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.slice(0, 10)).toBe(toFunctionSelector("graduate(address)"));
    expect(sent[0]!.toLowerCase()).toContain(A.slice(2).toLowerCase());
    expect(r.why).toBe("2 complete: 1 graduated, 1 refused, 0 reverted, 0 dry-run");
  });

  it("never sends when dry or without a sender", async () => {
    const r = await launchKeeperPass({ deps: deps({ [A]: 2 }), launchpad: PAD, dryRun: false })();
    expect(r.outcomes).toEqual([{ token: A, result: "dry-run" }]);
    expect(r.why).toContain("no sender wired");
    const idle = await launchKeeperPass({ deps: deps({ [C]: 3 }), launchpad: PAD, dryRun: true })();
    expect(idle.why).toBe("1 memecoin(s), none complete");
  });
});
