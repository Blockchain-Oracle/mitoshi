/** D-230: a boundary's prints travel in a few transactions, check slots and short cadences first. */
import { describe, expect, it } from "vitest";
import { MAX_CALLS_PER_TX } from "../../runtime/pack";
import { packPrints, type PrintUnit } from "./pack";

const call = { to: "0x113Ca86bE942671E5290Ed57d86297F0Ecd61b6a", data: "0x" } as const;
const unit = (name: string, cadenceSec: number, n = 2, check = false): PrintUnit<string> => ({
  items: Array.from({ length: n }, (_, i) => ({ job: `${name}.${i}`, call, note: "", copy: i > 0 })),
  cadenceSec,
  deadlineSec: 1_000 + cadenceSec,
  check,
});
const names = (packs: PrintUnit<string>[][]) => packs.map((p) => p.flatMap((u) => u.items.map((c) => c.job)));

describe("price-relay packing", () => {
  it("packs closes with their copied opens, 5-minute Windows first, a check slot before all", () => {
    const units = [unit("SOL-60", 3_600), unit("BTC-5", 300), unit("TSLA-15", 900), unit("chk", 900, 1, true), unit("ETH-5", 300)];
    const packs = packPrints(units, 4);
    expect(names(packs)).toEqual([["chk.0", "BTC-5.0", "BTC-5.1"], ["ETH-5.0", "ETH-5.1", "TSLA-15.0", "TSLA-15.1"], ["SOL-60.0", "SOL-60.1"]]);
    expect(packs.every((p) => p.flatMap((u) => u.items).length <= 4)).toBe(true);
  });

  it("sends the 15:00 boundary — 114 closes, each with its copied open — in 19 transactions, not 228", () => {
    const units = [300, 900, 3_600].flatMap((c) => Array.from({ length: 38 }, (_, i) => unit(`S${i}-${c}`, c)));
    const packs = packPrints(units);
    expect(packs).toHaveLength(Math.ceil(228 / MAX_CALLS_PER_TX));
    // Every 5-minute Window's pair goes out before any 15- or 60-minute one.
    const order = packs.flat().map((u) => u.cadenceSec);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
