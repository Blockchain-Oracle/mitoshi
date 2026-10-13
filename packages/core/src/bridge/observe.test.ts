import { describe, expect, it } from "vitest";
import { advanceTransfer, type ScanMessage } from "./index";

const row = { direction: "in" as const, network: "testnet" as const, srcTx: "0xaa", legs: [], createdAtMs: 0 };
const msg = (over: Partial<ScanMessage>): ScanMessage => ({
  guid: "0x01", srcEid: 40451, dstEid: 40245, status: "INFLIGHT", srcTx: "0xaa", srcAtSec: 100, dvnStatus: null, verifiedAtSec: null,
  dstStatus: "WAITING", dstTx: null, dstAtSec: null, composeStatus: "N/A", composeTx: null, composeAtSec: null, ...over,
});
const hopDone = msg({ status: "DELIVERED", dstStatus: "SUCCEEDED", dstTx: "0xb1", dstAtSec: 140, composeStatus: "SUCCEEDED", composeTx: "0xc1", composeAtSec: 150 });

describe("a transfer from LZ Scan and receipts (bridge-watch and the tracker, R4-12)", () => {
  it("keeps a just-sent transfer in flight, then hops, then delivers with its measured duration", () => {
    const sent = advanceTransfer(row, { src: null, legs: [], bounced: false }, null, 1_000);
    expect(sent).toMatchObject({ status: "in-flight", phase: "sent" });
    expect(sent.legs).toHaveLength(1);
    const hop = advanceTransfer(row, { src: "success", legs: [{ msg: hopDone, deferral: null }], bounced: false }, null, 1_000);
    expect(hop).toMatchObject({ status: "in-flight", phase: "hop" });
    const onward = msg({ guid: "0x02", srcEid: 40245, dstEid: 40444, status: "DELIVERED", dstStatus: "SUCCEEDED", srcAtSec: 150, dstTx: "0xd2", dstAtSec: 260 });
    const done = advanceTransfer(row, { src: "success", legs: [{ msg: hopDone, deferral: null }, { msg: onward, deferral: null }], bounced: false }, null, 1_000);
    expect(done).toMatchObject({ status: "delivered", phase: "delivered", durationSec: 160, deliveredAtMs: 260_000 });
    expect(done.legs.map((l) => l.guid)).toEqual(["0x01", "0x02"]);
  });

  it("names a stored compose (empty Base float), a deferral, a revert and a bounce", () => {
    const stored = msg({ status: "DELIVERED", dstStatus: "SUCCEEDED", composeStatus: "SIMULATION_REVERTED" });
    expect(advanceTransfer(row, { src: "success", legs: [{ msg: stored, deferral: null }], bounced: false }, null, 1)).toMatchObject({ status: "stuck", phase: "fuel" });
    const onward = msg({ guid: "0x02", srcEid: 40245, dstEid: 40444, status: "DELIVERED", dstStatus: "SUCCEEDED", dstTx: "0xd2", dstAtSec: 200 });
    const held = advanceTransfer(row, { src: "success", legs: [{ msg: hopDone, deferral: null }, { msg: onward, deferral: "supply-cap" }], bounced: false }, null, 1);
    expect(held).toMatchObject({ status: "deferred", phase: "deferred" });
    expect(held.legs[1]!.deferReason).toBe("supply-cap");
    expect(advanceTransfer(row, { src: "reverted", legs: [], bounced: false }, null, 1)).toMatchObject({ status: "reverted", phase: "nothing", legs: [] });
    expect(advanceTransfer(row, { src: null, legs: [{ msg: null, deferral: null }], bounced: false }, null, 31 * 60_000)).toMatchObject({ status: "failed", phase: "nothing" });
    expect(advanceTransfer(row, { src: null, legs: [{ msg: null, deferral: null }], bounced: false }, null, 29 * 60_000).status).toBe("in-flight");
    expect(advanceTransfer(row, { src: "success", legs: [{ msg: hopDone, deferral: null }], bounced: true }, null, 1)).toMatchObject({ status: "returned", phase: "returned" });
    expect(advanceTransfer(row, { src: "success", legs: [{ msg: msg({ status: "APPLICATION_BURNED" }), deferral: null }], bounced: false }, null, 1)).toMatchObject({ status: "failed", phase: "failed" });
  });

  it("drops a hash that is not this bridge's send, and releases a held credit once the holder's is empty", () => {
    expect(advanceTransfer(row, { src: "unrelated", legs: [], bounced: false }, null, 1)).toMatchObject({ status: "failed", phase: "nothing", legs: [] });
    const onward = msg({ guid: "0x02", srcEid: 40245, dstEid: 40444, status: "DELIVERED", dstStatus: "SUCCEEDED", dstTx: "0xd2", dstAtSec: 200 });
    const legs = [{ msg: hopDone, deferral: null }, { msg: onward, deferral: "receive-policy" as const }];
    expect(advanceTransfer(row, { src: "success", legs, bounced: false, heldNow: 5_000_000n }, null, 1)).toMatchObject({ status: "deferred", phase: "deferred" });
    expect(advanceTransfer(row, { src: "success", legs, bounced: false, heldNow: null }, null, 1)).toMatchObject({ status: "deferred", phase: "deferred" });
    const released = advanceTransfer(row, { src: "success", legs, bounced: false, heldNow: 0n }, null, 1);
    expect(released).toMatchObject({ status: "released", phase: "released" });
    expect(released.legs[1]!.deferReason).toBe("receive-policy");
  });
});
