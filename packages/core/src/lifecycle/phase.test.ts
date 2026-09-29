// Ported from Agari 03b30ab:packages/core/src/lifecycle/phase.test.ts
import { describe, expect, it } from "vitest";
import { isRestable, isStalledOpening, OPENING_PRINT_GRACE_SEC, phase, type PhaseInput } from "./phase";
import { ONCHAIN_STATUS } from "./status";

const START_SEC = 1_000_000;
const INTERVAL_SEC = 300;
const EXPIRY_SEC = START_SEC + INTERVAL_SEC;
const HEADROOM_SEC = 30;

function market(overrides: Partial<PhaseInput> = {}): PhaseInput {
  return {
    tradingStartSec: START_SEC,
    lockAtSec: EXPIRY_SEC,
    expirySec: EXPIRY_SEC,
    intervalSec: INTERVAL_SEC,
    openingPriceRaw: 1n,
    state: "open",
    status: "Trading",
    ...overrides,
  };
}

const at = (sec: number) => sec * 1000;

describe("phase", () => {
  it("walks the time-derived transitions of one window", () => {
    expect(phase(market(), at(START_SEC - 1))).toBe("upcoming");
    expect(phase(market({ openingPriceRaw: null }), at(START_SEC))).toBe("pendingOpeningPrint");
    expect(phase(market(), at(START_SEC))).toBe("trading");
    expect(phase(market(), at(EXPIRY_SEC - HEADROOM_SEC - 1))).toBe("trading");
    expect(phase(market(), at(EXPIRY_SEC - HEADROOM_SEC))).toBe("noEntryBuffer");
    expect(phase(market(), at(EXPIRY_SEC))).toBe("locked");
  });

  it("locks a Gap Window at lock_at while its closing print is still ahead", () => {
    const gap = market({ lockAtSec: EXPIRY_SEC, expirySec: EXPIRY_SEC + 48 * 3_600 });
    expect(phase(gap, at(EXPIRY_SEC - HEADROOM_SEC))).toBe("noEntryBuffer");
    expect(phase(gap, at(EXPIRY_SEC + 60))).toBe("locked");
  });

  it("derives settlement phases from indexed and on-chain status", () => {
    expect(phase(market({ status: "Resolved" }), at(EXPIRY_SEC + 5))).toBe("settledUnclaimed");
    expect(phase(market({ state: "resolved" }), at(EXPIRY_SEC + 5))).toBe("settledUnclaimed");
    expect(phase(market({ status: "Finalized" }), at(EXPIRY_SEC + 5))).toBe("finalized");
    expect(phase(market({ state: "voided" }), at(EXPIRY_SEC + 5))).toBe("voided");
    expect(phase(market({ onchainStatus: ONCHAIN_STATUS.Resolved }), at(START_SEC))).toBe("settledUnclaimed");
    expect(phase(market({ onchainStatus: ONCHAIN_STATUS.Voided }), at(START_SEC))).toBe("voided");
  });

  it("lets a head-fresh on-chain status override a lagging indexer row", () => {
    expect(phase(market({ status: "Trading", onchainStatus: ONCHAIN_STATUS.Locked }), at(START_SEC))).toBe("locked");
    expect(phase(market({ status: "Listed", onchainStatus: ONCHAIN_STATUS.Trading }), at(START_SEC))).toBe("trading");
    expect(phase(market({ status: "Trading", onchainStatus: ONCHAIN_STATUS.Listed }), at(START_SEC - 1))).toBe("upcoming");
  });
});

describe("isRestable", () => {
  it("admits a post-only call only while the Window is listed before its open (D-088)", () => {
    expect(isRestable("upcoming")).toBe(true);
    for (const p of ["pendingOpeningPrint", "trading", "noEntryBuffer", "locked", "settledUnclaimed", "finalized", "voided"] as const) expect(isRestable(p)).toBe(false);
  });
});

describe("isStalledOpening (S24: lists drop a Window whose opening print never came)", () => {
  it("waits out the grace, then calls a print-less started Window stalled", () => {
    const waiting = market({ openingPriceRaw: null });
    expect(isStalledOpening(waiting, at(START_SEC + 30))).toBe(false);
    expect(isStalledOpening(waiting, at(START_SEC + OPENING_PRINT_GRACE_SEC + 1))).toBe(true);
  });

  it("never calls a printed or not-yet-started Window stalled", () => {
    expect(isStalledOpening(market(), at(START_SEC + 200))).toBe(false);
    expect(isStalledOpening(market({ openingPriceRaw: null }), at(START_SEC - 60))).toBe(false);
  });
});
