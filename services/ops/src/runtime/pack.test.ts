/** D-230: an actor's calls travel in a few transactions; a refusal isolates itself, a transport failure never splits. */
import { describe, expect, it } from "vitest";
import { packUnits, sendPacked, type PackSender, type PackUnit } from "./pack";

const unit = (name: string, n = 2): PackUnit<string> => ({ items: Array.from({ length: n }, (_, i) => `${name}.${i}`) });
const names = (packs: PackUnit<string>[][]) => packs.map((p) => p.flatMap((u) => [...u.items]));

class Refused extends Error {}

/** A sender over a fake chain: `bad` calls are refused (and refuse any transaction carrying them); `down` fails the transport. */
function chain(bad: Set<string>, down = false) {
  const txs: string[][] = [];
  const s: PackSender<string> = {
    send: async (items) => {
      if (down) throw new Error("HTTP 429");
      if (items.some((i) => bad.has(i))) throw new Refused(items.find((i) => bad.has(i)));
      txs.push([...items]);
      return `0x${txs.length}`;
    },
    refused: (e) => e instanceof Refused,
    landed: (i, hash, n) => `${i} ✓ ${hash} ${n}`,
    failed: (i, e) => `${i} ✗ ${e instanceof Refused ? "refused" : "transport"}`,
    skipped: (i, after) => `${i} waits for ${after}`,
  };
  return { s, txs };
}

describe("ops packing", () => {
  it("packs units in the order given, never splitting one, at most maxCalls a transaction", () => {
    const packs = packUnits([unit("A"), unit("B", 1), unit("C"), unit("D", 3), unit("E", 0)], 4);
    expect(names(packs)).toEqual([["A.0", "A.1", "B.0"], ["C.0", "C.1"], ["D.0", "D.1", "D.2"]]);
    // A 5-minute boundary of 38 Series (a close and its copied open each): 7 transactions, not 76.
    expect(packUnits(Array.from({ length: 38 }, (_, i) => unit(`S${i}`)))).toHaveLength(7);
  });

  it("sends a clean pack as one transaction", async () => {
    const { s, txs } = chain(new Set());
    expect(await sendPacked(packUnits([unit("A"), unit("B")], 12), s)).toEqual(["A.0 ✓ 0x1 4", "A.1 ✓ 0x1 4", "B.0 ✓ 0x1 4", "B.1 ✓ 0x1 4"]);
    expect(txs).toEqual([["A.0", "A.1", "B.0", "B.1"]]);
  });

  it("isolates a refusal: the other units land, the refused unit's later calls wait for the next pass", async () => {
    const { s, txs } = chain(new Set(["B.0"]));
    const lines = await sendPacked(packUnits([unit("A"), unit("B"), unit("C")], 12), s);
    expect(lines).toEqual(["A.0 ✓ 0x1 2", "A.1 ✓ 0x1 2", "B.0 ✗ refused", "B.1 waits for B.0", "C.0 ✓ 0x2 2", "C.1 ✓ 0x2 2"]);
    expect(txs).toEqual([["A.0", "A.1"], ["C.0", "C.1"]]);
  });

  it("lands a unit's first call when only a later one is refused", async () => {
    const { s, txs } = chain(new Set(["A.1"]));
    expect(await sendPacked([[unit("A")]], s)).toEqual(["A.0 ✓ 0x1 1", "A.1 ✗ refused"]);
    expect(txs).toEqual([["A.0"]]);
  });

  it("never splits on a transport failure: every call is retried whole next pass", async () => {
    const { s, txs } = chain(new Set(), true);
    expect(await sendPacked([[unit("A"), unit("B")]], s)).toEqual(["A.0 ✗ transport", "A.1 ✗ transport", "B.0 ✗ transport", "B.1 ✗ transport"]);
    expect(txs).toEqual([]);
  });
});
