import { describe, expect, it } from "vitest";
import { encodeEventTopics, type Hex } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { keys } from "../react/keys";
import { opsFor } from "./dispatch";
import { opsForUserLogs, USER_EVENT_FIELDS } from "./user-logs";

const WALLET = "0x00000000000000000000000000000000000000A1";
const MARKET = `0x${"ab".repeat(32)}` as Hex;

describe("the wallet's own engine events from the chain (D-151)", () => {
  it("watches every event ops routes to user:<address>, each on an indexed field of EventsEngine", () => {
    for (const [name, field] of USER_EVENT_FIELDS) {
      const ev = (eventsEngineAbi as unknown as readonly { type: string; name?: string; inputs?: readonly { name: string; indexed?: boolean }[] }[]).find((x) => x.type === "event" && x.name === name);
      expect(ev?.inputs?.find((i) => i.name === field)?.indexed, `${name}.${field}`).toBe(true);
      // The filter the watcher asks the node for encodes (viem throws on a non-indexed or unknown arg).
      expect(() => encodeEventTopics({ abi: eventsEngineAbi, eventName: name as never, args: { [field]: WALLET } as never })).not.toThrow();
    }
  });

  it("marks exactly the reads the user: stream frame would", () => {
    const [sig, market] = encodeEventTopics({ abi: eventsEngineAbi, eventName: "Redeemed" as never, args: { marketId: MARKET } as never });
    const ops = opsForUserLogs(WALLET, [{ eventName: "Redeemed", topics: [sig as Hex, market as Hex] }]);
    const frame = opsFor("Redeemed", { topic: `user:${WALLET.toLowerCase()}`, data: { market: MARKET } });
    expect(ops).toEqual(frame);
    expect(ops).toContainEqual({ kind: "invalidate", key: keys.verdict(WALLET.toLowerCase(), MARKET) });
  });

  it("coalesces a burst into one invalidation per read", () => {
    const logs = Array.from({ length: 5 }, () => ({ eventName: "Fill", topics: [null, MARKET] as (Hex | null)[] }));
    const ops = opsForUserLogs(WALLET, logs);
    expect(new Set(ops.map((o) => JSON.stringify(o.key))).size).toBe(ops.length);
  });
});
