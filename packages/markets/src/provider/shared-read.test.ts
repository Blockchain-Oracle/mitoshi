import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketId } from "@cwf/core";

// The lens read is stubbed to count calls: the question here is how many times the chain is asked, not what it says.
const calls: MarketId[][] = [];
vi.mock("../engine/lens", async (orig) => ({
  ...(await orig<typeof import("../engine/lens")>()),
  readWindows: vi.fn(async (ids: readonly MarketId[]) => {
    calls.push([...ids]);
    await new Promise((r) => setTimeout(r, 5));
    return new Map(ids.map((id) => [id, { marketId: id } as never]));
  }),
}));
const { readWindowsShared, SHARED_READ_MS } = await import("./engine-reads");

const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as MarketId;
let clock = 1_000_000;

describe("readWindowsShared (D-152)", () => {
  beforeEach(() => {
    calls.length = 0;
    clock += 10 * SHARED_READ_MS; // forget earlier tests' answers
  });

  it("answers a lane card's own read from the lane list's read in the same pass", async () => {
    const all = [id(1), id(2), id(3)];
    expect([...(await readWindowsShared(all, () => clock)).keys()]).toEqual(all);
    const one = await readWindowsShared([id(2)], () => clock + 50);
    expect([...one.keys()]).toEqual([id(2)]);
    expect(calls).toEqual([all]);
  });

  it("joins a read already in flight instead of sending another", async () => {
    const lanes = readWindowsShared([id(4), id(5)], () => clock);
    const card = readWindowsShared([id(5), id(6)], () => clock);
    await Promise.all([lanes, card]);
    expect(calls).toEqual([[id(4), id(5)], [id(6)]]);
  });

  it("reads again once the answer is older than the window", async () => {
    await readWindowsShared([id(7)], () => clock);
    await readWindowsShared([id(7)], () => clock + SHARED_READ_MS + 1);
    expect(calls).toEqual([[id(7)], [id(7)]]);
  });
});
