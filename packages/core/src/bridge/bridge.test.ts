import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import {
  activeLegIndex,
  bridgeStatusOf,
  composeMsg,
  conservation,
  decodeComposeMsg,
  deliveredLegs,
  etaOf,
  fromShared,
  legDurationSec,
  legFromScan,
  parseScanList,
  partitionOf,
  removeDust,
  reserveVerdict,
  routeOf,
  toShared,
  trackerPhase,
  type LegStatus,
  type ReserveReads,
  type ScanMessage,
} from "./index";

describe("bridge status", () => {
  it.each(vectors.cases)("$legs → $status", (c) => {
    const legs = (c.legs as LegStatus[]).map((status) => ({ guid: null, status }));
    expect(bridgeStatusOf(legs)).toBe(c.status);
    expect(activeLegIndex(legs)).toBe(c.active);
  });
});

const DEPLOYER = "0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e" as const;
const ADAPTER = "0x5c1069C9F9912D5B8f6250359b5f2FB6F6a426b3" as const;

describe("routes", () => {
  it("hops through Base on testnet and goes direct on mainnet", () => {
    const inT = routeOf("in", "testnet");
    expect(inT.stops).toEqual(["robinhood", "base", "tempo"]);
    expect(inT.legs.map((l) => [l.srcEid, l.dstEid, l.compose])).toEqual([[40451, 40245, true], [40245, 40444, false]]);
    expect(routeOf("out", "testnet").legs.map((l) => [l.srcEid, l.dstEid, l.compose])).toEqual([[40444, 40245, true], [40245, 40451, false]]);
    expect(routeOf("in", "mainnet").legs.map((l) => [l.srcEid, l.dstEid])).toEqual([[30416, 30410]]);
  });
});

describe("compose message and amounts", () => {
  it("encodes what HopComposer decodes (cast abi-encode vector)", () => {
    const m = composeMsg(40451, DEPLOYER, 5_000_000_000_000_000_000n);
    expect(m).toBe("0x0000000000000000000000000000000000000000000000000000000000009e03000000000000000000000000900a0f5260b91fd65d0c2b03d92cf8013a1f073e0000000000000000000000000000000000000000000000004563918244f40000");
    expect(decodeComposeMsg(m)).toEqual({ finalEid: 40451, finalTo: DEPLOYER.toLowerCase(), minLD: 5n * 10n ** 18n });
    expect(decodeComposeMsg("0x1234")).toBeNull();
  });

  it("drops dust below the 6 shared decimals and converts between local and shared", () => {
    expect(removeDust(1_234_567_891_234_567_891n, 18)).toBe(1_234_567_000_000_000_000n);
    expect(removeDust(5_000_000n, 6)).toBe(5_000_000n);
    expect(toShared(1_234_567_891_234_567_891n, 18)).toBe(1_234_567n);
    expect(fromShared(1_234_567n, 18)).toBe(1_234_567_000_000_000_000n);
    expect(() => removeDust(1n, 4)).toThrow();
  });
});

const scan = (over: Partial<ScanMessage>): ScanMessage => ({
  guid: "0x01", srcEid: 40245, dstEid: 40444, status: "INFLIGHT", srcTx: "0xaa", srcAtSec: 100, dvnStatus: null, verifiedAtSec: null,
  dstStatus: "WAITING", dstTx: null, dstAtSec: null, composeStatus: "N/A", composeTx: null, composeAtSec: null, ...over,
});

describe("LZ Scan legs", () => {
  it("parses a real LZ Scan answer (the 2026-10-12 Base → Moderato ping)", () => {
    const raw = { data: [{ pathway: { srcEid: 40245, dstEid: 40444 }, source: { tx: { txHash: "0xE4D5", blockTimestamp: 1791840956 } }, destination: { lzCompose: { status: "N/A" }, tx: { txHash: "0x80fd", blockTimestamp: 1791840979 }, status: "SUCCEEDED" }, verification: { dvn: { dvns: { "0x0ac2": { blockTimestamp: 1791840970 } }, status: "SUCCEEDED" } }, guid: "0x4e74", status: { name: "DELIVERED" } }, { nope: 1 }] };
    const [m] = parseScanList(raw);
    expect(parseScanList(raw)).toHaveLength(1);
    expect(m).toMatchObject({ guid: "0x4e74", srcTx: "0xe4d5", srcAtSec: 1791840956, verifiedAtSec: 1791840970, dstAtSec: 1791840979, composeStatus: "N/A" });
    expect(legFromScan(m!, false)).toEqual({ status: "delivered", stuck: null });
    expect(legDurationSec(m!, false)).toBe(23);
    expect(parseScanList(null)).toEqual([]);
  });

  it("maps every status: sent, verified, stuck on the executor or the compose, delivered, failed", () => {
    expect(legFromScan(scan({}), false).status).toBe("source-sent");
    expect(legFromScan(scan({ dvnStatus: "SUCCEEDED" }), false).status).toBe("verified");
    expect(legFromScan(scan({ status: "FAILED", dstStatus: "SIMULATION_REVERTED", dvnStatus: "SUCCEEDED" }), false)).toEqual({ status: "stuck", stuck: "executor" });
    expect(legFromScan(scan({ status: "DELIVERED", dstStatus: "SUCCEEDED", composeStatus: "WAITING" }), true).status).toBe("verified");
    expect(legFromScan(scan({ status: "DELIVERED", dstStatus: "SUCCEEDED", composeStatus: "SIMULATION_REVERTED" }), true)).toEqual({ status: "stuck", stuck: "compose" });
    expect(legFromScan(scan({ status: "DELIVERED", dstStatus: "SUCCEEDED", composeStatus: "SUCCEEDED" }), true).status).toBe("delivered");
    expect(legFromScan(scan({ status: "APPLICATION_BURNED" }), false).status).toBe("failed");
  });
});

describe("tracker", () => {
  const route = routeOf("in", "testnet");
  const base = { route, srcTx: "0xaa" as const, srcReverted: false, startedAtMs: 0, nowMs: 60_000, eta: null };
  it("names one phase from the legs and the measured ETA", () => {
    expect(trackerPhase({ ...base, srcTx: null, legs: [] })).toBe("wallet");
    expect(trackerPhase({ ...base, srcReverted: true, legs: [] })).toBe("nothing");
    expect(trackerPhase({ ...base, legs: [{ guid: "0x1", status: "source-sent" }] })).toBe("sent");
    expect(trackerPhase({ ...base, legs: [{ guid: "0x1", status: "delivered" }, { guid: "0x2", status: "source-sent" }] })).toBe("hop");
    expect(trackerPhase({ ...base, legs: [{ guid: "0x1", status: "stuck", stuck: "compose" }] })).toBe("fuel");
    expect(trackerPhase({ ...base, legs: [{ guid: "0x1", status: "delivered" }, { guid: "0x2", status: "deferred" }] })).toBe("deferred");
    expect(trackerPhase({ ...base, legs: [{ guid: "0x1", status: "delivered" }, { guid: "0x2", status: "delivered" }] })).toBe("delivered");
    expect(trackerPhase({ ...base, legs: [{ guid: "0x1", status: "delivered" }] })).toBe("hop");
    expect(trackerPhase({ ...base, nowMs: 400_000, eta: etaOf([120, 200, 300]), legs: [{ guid: "0x1", status: "source-sent" }] })).toBe("slow");
    expect(deliveredLegs([{ guid: "0x1", status: "delivered" }, { guid: "0x2", status: "verified" }])).toBe(1);
    expect(bridgeStatusOf([{ guid: "0x1", status: "stuck" }])).toBe("stuck");
  });

  it("measures the ETA only from real samples", () => {
    expect(etaOf([])).toBeNull();
    expect(etaOf([23])).toEqual({ medianSec: 23, p95Sec: 23, samples: 1 });
    expect(etaOf([40, 10, 30, 20])).toEqual({ medianSec: 25, p95Sec: 40, samples: 4 });
  });
});

describe("reserves", () => {
  const today: ReserveReads = { lockbox: null, transitSupply: 0n, supply: 0n, supplyCap: 1_000_000_000n, deferred: 0n, mintedNet: 0n, adapter: ADAPTER, issuers: [ADAPTER.toLowerCase() as `0x${string}`] };
  it("is partial while the Robinhood side is not live, and never passes a check it could not run", () => {
    const c = conservation(today);
    expect(c.checks.find((x) => x.id === "covered")!.status).toBe("unavailable");
    expect(c.checks.filter((x) => x.status === "pass").map((x) => x.id)).toEqual(["minted", "issuer", "cap"]);
    expect(c.ok).toBe(true);
    expect(reserveVerdict([c])).toBe("partial");
  });

  it("backs every unit once the lockbox reads: locked ≥ outstanding + owed, and nothing unaccounted", () => {
    const c = conservation({ ...today, lockbox: { locked: 26_000_000n, outstanding: 25_000_000n, owed: 0n }, transitSupply: 2_000_000n, supply: 20_000_000n, mintedNet: 20_000_000n, deferred: 1_000_000n });
    expect(c.inFlight).toBe(2_000_000n);
    expect(c.surplus).toBe(1_000_000n);
    expect(reserveVerdict([c])).toBe("backed");
    expect(partitionOf(c)).toEqual([{ part: "onTempo", value: 20_000_000n }, { part: "inFlight", value: 4_000_000n }, { part: "held", value: 1_000_000n }, { part: "surplus", value: 1_000_000n }]);
  });

  it("is short when a mint is unbacked, the adapter is not the only issuer, or supply runs past the lock", () => {
    expect(reserveVerdict([conservation({ ...today, supply: 5n, mintedNet: 0n })])).toBe("short");
    expect(reserveVerdict([conservation({ ...today, issuers: [ADAPTER, DEPLOYER] })])).toBe("short");
    const over = conservation({ ...today, lockbox: { locked: 10n, outstanding: 10n, owed: 0n }, supply: 11n, mintedNet: 11n });
    expect(over.checks.find((x) => x.id === "accounted")!.status).toBe("fail");
    expect(conservation({ ...today, lockbox: { locked: 9n, outstanding: 10n, owed: 0n } }).checks[0]!.status).toBe("fail");
  });
});
