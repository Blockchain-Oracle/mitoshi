/**
 * Segmenting (R6): range math over the index's gaps, and the tile plan — what a pass compares when the index skips
 * blocks, when it later backfills them, when the head moves, and when the manifest gains a contract.
 */
import { describe, expect, it } from "vitest";
import { applyItem, comparedBlocks, planRecount, type PlanSource, type TileState } from "./plan";
import { blockCount, chunkRanges, clipRanges, formatRange, heldSegments, inRanges, intersectRanges, largestRange, normalizeRanges, subtractRanges, walkSpans, type BlockRange } from "./ranges";

const r = (from: number, to: number): BlockRange => ({ from: BigInt(from), to: BigInt(to) });
const show = (ranges: readonly BlockRange[]) => ranges.map(formatRange);

describe("ranges", () => {
  it("normalizes: drops empty, sorts, merges overlapping and touching", () => {
    expect(show(normalizeRanges([r(20, 25), r(5, 4), r(1, 3), r(4, 6), r(24, 30)]))).toEqual(["1–6", "20–30"]);
  });
  it("cuts the index's gaps out of a range: held segments, including gaps at either end", () => {
    const gaps = [r(100, 104), r(110, 110), r(195, 230), r(10, 20)];
    expect(show(heldSegments(100n, 200n, gaps))).toEqual(["105–109", "111–194"]);
    expect(show(heldSegments(90n, 99n, gaps))).toEqual(["90–99"]);
    expect(heldSegments(100n, 104n, gaps)).toEqual([]);
    expect(heldSegments(5n, 4n, gaps)).toEqual([]);
    expect(blockCount(heldSegments(100n, 200n, gaps)) + blockCount(clipRanges(gaps, 100n, 200n))).toBe(101n);
  });
  it("subtracts and intersects", () => {
    expect(show(subtractRanges([r(1, 10), r(20, 30)], [r(5, 22)]))).toEqual(["1–4", "23–30"]);
    expect(show(intersectRanges([r(1, 10), r(20, 30)], [r(5, 22)]))).toEqual(["5–10", "20–22"]);
  });
  it("finds a block by binary search, joins near segments into one walk, chunks for SQL", () => {
    const segs = normalizeRanges([r(1, 5), r(10, 10), r(40, 50)]);
    expect([0, 1, 5, 6, 10, 39, 45, 51].map((b) => inRanges(segs, BigInt(b)))).toEqual([false, true, true, false, true, false, true, false]);
    expect(show(walkSpans(segs, 10n))).toEqual(["1–10", "40–50"]);
    expect(chunkRanges(segs, 2).map((c) => c.length)).toEqual([2, 1]);
    expect(formatRange(largestRange(segs)!)).toBe("40–50");
  });
});

describe("tile plan", () => {
  const T = 100n;
  const A = "0x00000000000000000000000000000000000000aa";
  const B = "0x00000000000000000000000000000000000000bb";
  const C = "0x00000000000000000000000000000000000000cc";
  const sources: PlanSource[] = [
    { address: A, deployBlock: 150n },
    { address: B, deployBlock: 260n },
  ];

  it("cuts history on the grid from the first deploy, each tile for the contracts deployed by its end, head first", () => {
    const items = planRecount({ sources, top: 330n, tileBlocks: T, tiles: [], gaps: [r(205, 209), r(320, 340)] });
    expect(items.map((i) => [i.kind, i.tileFrom, formatRange(i), i.addresses.length])).toEqual([
      ["new", 300n, "300–330", 2],
      ["new", 100n, "150–199", 1],
      ["new", 200n, "200–299", 2],
    ]);
    const head = items[0]!;
    expect(show(head.segments)).toEqual(["300–319"]);
    expect(show(head.skipped)).toEqual(["320–330"]);
    expect(show(items[2]!.segments)).toEqual(["200–204", "210–299"]);
  });

  it("records what was compared, extends the head tile, and refills a gap the index backfilled", () => {
    const first = planRecount({ sources, top: 330n, tileBlocks: T, tiles: [], gaps: [r(205, 209), r(320, 340)] });
    const tiles = new Map<bigint, TileState>();
    for (const item of first) tiles.set(item.tileFrom, applyItem(tiles.get(item.tileFrom), item));
    expect(tiles.get(200n)).toMatchObject({ from: 200n, to: 299n, gaps: [r(205, 209)] });
    expect(tiles.get(300n)).toMatchObject({ from: 300n, to: 330n, gaps: [r(320, 330)] });
    expect(comparedBlocks([...tiles.values()])).toBe(50n + 95n + 20n);

    // An hour on: the head moved to 420, the index backfilled 205–209 and 320–325, and lacks 400–402.
    const next = planRecount({ sources, top: 420n, tileBlocks: T, tiles: [...tiles.values()], gaps: [r(326, 340), r(400, 402)] });
    expect(next.map((i) => [i.kind, i.tileFrom, formatRange(i)])).toEqual([
      ["new", 400n, "400–420"],
      ["refill", 200n, "205–209"],
      ["refill", 300n, "320–325"],
      ["extend", 300n, "331–399"],
    ]);
    expect(show(next.find((i) => i.kind === "extend")!.segments)).toEqual(["341–399"]);
    for (const item of next) tiles.set(item.tileFrom, applyItem(tiles.get(item.tileFrom), item));
    expect(tiles.get(200n)!.gaps).toEqual([]);
    expect(show(tiles.get(300n)!.gaps)).toEqual(["326–340"]);
    expect(tiles.get(300n)).toMatchObject({ from: 300n, to: 399n });

    // Nothing new: no work.
    expect(planRecount({ sources, top: 420n, tileBlocks: T, tiles: [...tiles.values()], gaps: [r(326, 340), r(400, 402)] })).toEqual([]);
  });

  it("backfills a contract the manifest gained after its tiles were compared, without re-walking the others", () => {
    const tiles: TileState[] = [{ tileFrom: 100n, from: 150n, to: 199n, addresses: [A.toLowerCase()], gaps: [] }];
    const items = planRecount({ sources: [...sources, { address: C, deployBlock: 120n }], top: 199n, tileBlocks: T, tiles, gaps: [] });
    expect(items.map((i) => [i.kind, formatRange(i), i.addresses])).toEqual([
      ["backfill", "120–149", [C]],
      ["backfill", "150–199", [C]],
    ]);
    let state: TileState | undefined = tiles[0];
    for (const item of items) state = applyItem(state, item);
    expect(state).toMatchObject({ from: 120n, to: 199n, addresses: [A, C] });
  });

  it("an extension adds only contracts deployed inside it; a contract missing from earlier blocks stays to backfill", () => {
    const done: TileState = { tileFrom: 100n, from: 150n, to: 199n, addresses: [A], gaps: [] };
    const tiles: TileState[] = [done, { tileFrom: 200n, from: 200n, to: 250n, addresses: [A], gaps: [] }];
    const items = planRecount({ sources: [...sources, { address: C, deployBlock: 210n }], top: 299n, tileBlocks: T, tiles, gaps: [] });
    expect(items.map((i) => [i.kind, formatRange(i)])).toEqual([["backfill", "200–250"], ["extend", "251–299"]]);
    const extend = items.find((i) => i.kind === "extend")!;
    expect(extend.addresses).toEqual([A, B, C]);
    expect(extend.adds).toEqual([B]);
    // Only the extension lands (the backfill failed): C is not counted as compared, so the next plan backfills it.
    const after = applyItem(tiles[1], extend);
    expect(after.addresses).toEqual([A, B]);
    expect(planRecount({ sources: [...sources, { address: C, deployBlock: 210n }], top: 299n, tileBlocks: T, tiles: [done, after], gaps: [] }).map((i) => [i.kind, formatRange(i), i.addresses])).toEqual([["backfill", "200–299", [C]]]);
  });
});
