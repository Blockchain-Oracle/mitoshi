import { describe, expect, it } from "vitest";
import { BOARD_VERSION, bookTop, decodeBoard, encodeBoard, type BoardEntry, type BoardWire } from "./wire";

const ID = `0x${"ab".repeat(32)}` as BoardWire["live"] extends (infer T)[] | null ? T : never;

// The shape the lens answers (bigints at several depths, nulls, a nested print), not a full Window: the codec is generic.
const entry = {
  facts: {
    marketId: ID,
    status: 1,
    series: { seriesId: `0x${"cd".repeat(32)}`, lotBase: 1_000_000n, tickBase: 1_000n, cashUnit: 1_000n, minLots: 1n, decimals: 6, cadenceSec: 300 },
    market: { marketId: ID, index: 42n, asset: "BTC", openingPriceRaw: 8_334_100_000_000n, volumeQuoteRaw: 0n, winningOutcome: null, question: "BTC holds above $83,341?" },
    snapshot: { marketId: ID, seq: 7n, payouts: null, prints: { open: { priceE8: 8_334_100_000_000n, sourceTsSec: 1_760_400_000, source: "redstone", signers: 3 }, close: null } },
    backingLots: 12n,
  },
  book: { bids: [[480, 10n], [470, 4n]], asks: [[520, 3n]] },
  atMs: 1_760_400_001_000,
} as unknown as BoardEntry;

const board: BoardWire = { v: BOARD_VERSION, asOfMs: entry.atMs, live: [ID], windows: { [ID]: entry } };

describe("the board codec", () => {
  it("round-trips bigints at every depth", () => {
    expect(decodeBoard(encodeBoard(board))).toEqual(board);
  });
  it("keeps a string that only looks like a number a string", () => {
    const odd = { ...board, windows: { [ID]: { ...entry, facts: { ...entry.facts, market: { ...entry.facts.market, question: "123" } } } } } as BoardWire;
    expect(decodeBoard(encodeBoard(odd))!.windows[ID]!.facts.market.question).toBe("123");
  });
  it("fails closed on another version, a non-board or garbage", () => {
    expect(decodeBoard(encodeBoard({ ...board, v: 2 as typeof BOARD_VERSION }))).toBeNull();
    expect(decodeBoard(JSON.stringify({ error: "no board yet" }))).toBeNull();
    expect(decodeBoard("<html>502</html>")).toBeNull();
  });
  it("reads /v1/windows answers (no live list) as live: null", () => {
    expect(decodeBoard(encodeBoard({ ...board, live: null }))!.live).toBeNull();
  });
});

describe("bookTop", () => {
  it("takes the best n a side, the whole book at the board's depth", () => {
    expect(bookTop(entry.book, 1)).toEqual({ bids: [[480, 10n]], asks: [[520, 3n]] });
    expect(bookTop(entry.book, 10)).toBe(entry.book);
  });
});
