/** D-230: `/session.prints` tells the app how long an opening print takes and, in three words, why prints stall. */
import { describe, expect, it } from "vitest";
import { printsState, stallKind } from "./session";

describe("/session.prints", () => {
  it("names a stall by what the price network answered", () => {
    expect(stallKind("RedStone gateways failed (HTTP 403 public_gateway_rejected from https://oracle-gateway-1.a.redstone.finance, resting 30 s)")).toBe("refused");
    expect(stallKind("RedStone gateways failed (HTTP 403 blocked by the CDN from https://oracle-gateway-2.a.redstone.finance)")).toBe("refused");
    expect(stallKind("the price network has not signed it yet")).toBe("unsigned");
    expect(stallKind("RedStone gateways failed (https://oracle-gateway-1.a.redstone.finance: fetch failed)")).toBe("unreachable");
  });

  it("reads the relay's heartbeat, and says nothing it doesn't know", () => {
    expect(printsState({ openLagSec: { p50: 6, max: 9, n: 30 }, stall: { sinceSec: 1_791_904_500, reason: "HTTP 403 public_gateway_rejected" } })).toEqual({ openLagSec: 6, stall: { sinceSec: 1_791_904_500, kind: "refused" } });
    expect(printsState({ openLagSec: null, stall: null })).toEqual({ openLagSec: null, stall: null });
    expect(printsState(undefined)).toEqual({ openLagSec: null, stall: null });
  });
});
