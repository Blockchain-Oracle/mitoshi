import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMarketsEnv } from "../env";
import { configureMarkets } from "../runtime/read-runtime";
import { BOARD_VERSION, encodeBoard, type BoardEntry } from "../board/wire";
import { boardEntries, boardLive, boardLiveWindows, resetBoardReads } from "./board-reads";

const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
const entry = (n: number, atMs = Date.now()): BoardEntry =>
  ({ facts: { marketId: id(n), market: { marketId: id(n), state: "open", lockAtSec: 2e9, expirySec: 2e9 + n }, snapshot: {}, series: {} }, book: { bids: [], asks: [] }, atMs }) as unknown as BoardEntry;
const reply = (windows: BoardEntry[], live: string[] | null = null) =>
  new Response(encodeBoard({ v: BOARD_VERSION, asOfMs: Date.now(), live: live as never, windows: Object.fromEntries(windows.map((w) => [w.facts.marketId, w])) }));

describe("display reads from ops' board", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    resetBoardReads();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    configureMarkets(parseMarketsEnv({ opsUrl: "https://ops.example" }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks once for everything requested in one pass, and reuses the answer for a second", async () => {
    fetchMock.mockResolvedValueOnce(reply([entry(1), entry(2)]));
    const [a, b] = await Promise.all([boardEntries([id(1)]), boardEntries([id(2), id(3)])]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`https://ops.example/v1/windows?ids=${id(1)},${id(2)},${id(3)}`);
    expect([...a.keys()]).toEqual([id(1)]);
    expect([...b.keys()]).toEqual([id(2)]); // id(3) isn't on the board: the caller reads the chain
    await boardEntries([id(1), id(2)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(boardLive()).toBe(true);
  });

  it("a Window ops doesn't hold goes straight to the chain for a minute", async () => {
    fetchMock.mockResolvedValueOnce(reply([]));
    expect((await boardEntries([id(9)])).size).toBe(0);
    expect((await boardEntries([id(9)])).size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves nothing stale: an entry ops read long ago is the chain's to answer", async () => {
    fetchMock.mockResolvedValueOnce(reply([entry(1, Date.now() - 120_000)]));
    expect((await boardEntries([id(1)])).size).toBe(0);
  });

  it("a failed ops turns the board off for this tab (the chain answers) instead of retrying every read", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    expect((await boardEntries([id(1)])).size).toBe(0);
    expect(await boardLiveWindows()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(boardLive()).toBe(false);
  });

  it("the lane list is the board's live set, in its order", async () => {
    fetchMock.mockResolvedValueOnce(reply([entry(2), entry(1)], [id(1), id(2)]));
    expect((await boardLiveWindows())!.map((e) => e.facts.marketId)).toEqual([id(1), id(2)]);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://ops.example/v1/board");
  });

  it("does nothing without an ops URL", async () => {
    configureMarkets(parseMarketsEnv({}));
    expect((await boardEntries([id(1)])).size).toBe(0);
    expect(await boardLiveWindows()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
