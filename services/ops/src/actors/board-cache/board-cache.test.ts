import { afterEach, describe, expect, it } from "vitest";
import { decodeBoard, type BoardEntry } from "@cwf/markets/board";
import type { MarketId } from "@cwf/core";
import { createBus, type BusEvent } from "../../runtime/bus";
import { boardBody, runBoard, windowsBody } from "./index";

const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as MarketId;
const at = (n: number, seq: bigint, lockAtSec = 2e9): BoardEntry =>
  ({ facts: { marketId: id(n), market: { marketId: id(n), state: "open", lockAtSec, expirySec: lockAtSec + n }, snapshot: { seq }, series: {} }, book: { bids: [], asks: [] }, atMs: Date.now() }) as unknown as BoardEntry;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the board cache", () => {
  let stop = () => {};
  afterEach(() => stop());

  it("sweeps, serves the board from memory, and re-reads only a Window an engine event touched", async () => {
    const bus = createBus();
    const seen: BusEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const seq = new Map<MarketId, bigint>([[id(1), 1n], [id(2), 1n]]);
    const asked: MarketId[][] = [];
    const run = runBoard({
      bus,
      log: () => {},
      listIds: async () => [id(1), id(2)],
      read: async (ids) => (asked.push([...ids]), new Map(ids.map((i) => [i, at(Number(BigInt(i)), seq.get(i)!)]))),
      sweepMs: 60_000,
      flushMs: 10,
    });
    stop = run.stop;
    await sleep(30);
    const board = decodeBoard(boardBody()!.text)!;
    expect(board.live).toEqual([id(1), id(2)]);
    expect(Object.keys(board.windows)).toHaveLength(2);
    // The first sweep announces both Windows and the live set.
    expect(seen.filter((e) => e.event === "window").map((e) => e.topic)).toEqual([`market:${id(1)}`, `market:${id(2)}`]);
    expect(seen.filter((e) => e.event === "board")).toHaveLength(1);

    seen.length = 0;
    seq.set(id(2), 2n);
    bus.publish(`market:${id(2)}`, "Fill", { market: id(2) });
    bus.publish("fills", "Fill", { market: id(2) }); // not a market topic: ignored
    bus.publish(`market:${id(1)}`, "price", {}); // not an engine event: ignored
    await sleep(40);
    expect(asked.at(-1)).toEqual([id(2)]);
    expect(seen.filter((e) => e.event === "window").map((e) => e.topic)).toEqual([`market:${id(2)}`]);
    expect(seen.filter((e) => e.event === "board")).toHaveLength(0); // the live set didn't move

    // An unchanged re-read is not announced.
    seen.length = 0;
    bus.publish(`market:${id(1)}`, "OrderExecuted", { market: id(1) });
    await sleep(40);
    expect(seen.filter((e) => e.event === "window")).toHaveLength(0);

    const two = decodeBoard(windowsBody([id(2), id(9)])!.text)!;
    expect(Object.keys(two.windows)).toEqual([id(2)]);
    expect(two.live).toBeNull();
  });

  it("serves nothing before its first sweep, or once stopped", async () => {
    const run = runBoard({ bus: createBus(), log: () => {}, listIds: () => new Promise(() => {}), read: async () => new Map(), sweepMs: 60_000, flushMs: 10 });
    expect(boardBody()).toBeNull();
    run.stop();
    expect(windowsBody([id(1)])).toBeNull();
  });
});
