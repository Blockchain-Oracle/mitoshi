import { describe, expect, it } from "vitest";
import { pooledOpenCost, replayVaultCost, tallyOpenCost, type VaultTallyCounts } from "./open-cost";

const ONE = 1_000_000n;
const tally = (o: Partial<VaultTallyCounts>): VaultTallyCounts => ({ costBase: 0n, boughtUpRaw: 0n, boughtDownRaw: 0n, soldUpRaw: 0n, soldDownRaw: 0n, ...o });

describe("Trading Balance open cost (D-227)", () => {
  it("is the tally's cost for a one-sided bet never sold from; anything else needs the fills", () => {
    expect(tallyOpenCost(tally({ costBase: 5n * ONE, boughtUpRaw: 10n * ONE }))).toEqual({ upBase: 5n * ONE, downBase: 0n });
    expect(tallyOpenCost(tally({ costBase: 3n * ONE, boughtDownRaw: 10n * ONE }))).toEqual({ upBase: 0n, downBase: 3n * ONE });
    expect(tallyOpenCost(tally({ costBase: 5n * ONE, boughtUpRaw: 10n * ONE, soldUpRaw: 5n * ONE }))).toBeNull();
    expect(tallyOpenCost(tally({ costBase: 8n * ONE, boughtUpRaw: 10n * ONE, boughtDownRaw: 5n * ONE }))).toBeNull();
  });

  it("replays a Reduce at average cost: buy 10 Up for $5.00, sell 5 for $3.50 — 5 left at $2.50 (not $1.50 net)", () => {
    const r = replayVaultCost([
      { outcomeIdx: 0, isBuy: true, cashBase: 5n * ONE, tokenRaw: 10n * ONE },
      { outcomeIdx: 0, isBuy: false, cashBase: 3_500_000n, tokenRaw: 5n * ONE },
    ]);
    expect(r).toEqual({ upBase: 2_500_000n, downBase: 0n, upRaw: 5n * ONE, downRaw: 0n });
  });

  it("replays a re-entry from its own cost and keeps a hedge's sides apart", () => {
    // Up: 10 for $5.00, all sold for $6.00, 10 again for $5.50 → $5.50. Down: 4 for $1.20, 1 sold → $0.90 on 3.
    const r = replayVaultCost([
      { outcomeIdx: 0, isBuy: true, cashBase: 5n * ONE, tokenRaw: 10n * ONE },
      { outcomeIdx: 1, isBuy: true, cashBase: 1_200_000n, tokenRaw: 4n * ONE },
      { outcomeIdx: 0, isBuy: false, cashBase: 6n * ONE, tokenRaw: 10n * ONE },
      { outcomeIdx: 0, isBuy: true, cashBase: 5_500_000n, tokenRaw: 10n * ONE },
      { outcomeIdx: 1, isBuy: false, cashBase: 400_000n, tokenRaw: 1n * ONE },
    ]);
    expect(r).toEqual({ upBase: 5_500_000n, downBase: 900_000n, upRaw: 10n * ONE, downRaw: 3n * ONE });
  });

  it("falls back to the tally's average over everything bought", () => {
    // One side: $5.00 for 10, 5 held → $2.50.
    expect(pooledOpenCost(tally({ costBase: 5n * ONE, boughtUpRaw: 10n * ONE, soldUpRaw: 5n * ONE }), { upRaw: 5n * ONE, downRaw: 0n })).toEqual({ upBase: 2_500_000n, downBase: 0n });
    // Both: $6.00 over 12 bought is 50¢ each; 4 Up and 2 Down held → $2.00 and $1.00.
    expect(pooledOpenCost(tally({ costBase: 6n * ONE, boughtUpRaw: 8n * ONE, boughtDownRaw: 4n * ONE }), { upRaw: 4n * ONE, downRaw: 2n * ONE })).toEqual({ upBase: 2n * ONE, downBase: 1n * ONE });
    expect(pooledOpenCost(tally({}), { upRaw: 1n, downRaw: 0n })).toEqual({ upBase: 0n, downBase: 0n });
  });
});
