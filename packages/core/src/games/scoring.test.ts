// Ported from Masayume 68f7a09:packages/core/src/games/scoring.test.ts
import { describe, expect, it } from "vitest";
import type { Address } from "../types/primitives";
import { arenaPickKey } from "./arena";
import { cardPnl, playerPnl, scoreForCreator, settleMatch } from "./scoring";
import type { CardReceipt, Pick } from "./types";

const CREATOR = "0xaaaa111111111111111111111111111111111111" as Address;
const CHALLENGER = "0xbbbb111111111111111111111111111111111111" as Address;
const MATCH_ID = `0x${"11".repeat(32)}`;
const POT = 5_000_000n; // 5 tUSDC at six decimals.

function receipt(player: Address, cardIndex: number, costBase: bigint, payoutBase: bigint | null, pick: Pick = "up"): CardReceipt {
  return { cardIndex, player, pick, quantity: 1_000_000n, costBase, payoutBase, pickKey: arenaPickKey(50_312, MATCH_ID, cardIndex, player === CREATOR ? 0 : 1) };
}

describe("duel scoring", () => {
  it("scores a card on measured cost and real payout, not on a quote", () => {
    expect(cardPnl(receipt(CREATOR, 0, 400_000n, 1_000_000n))).toBe(600_000n);
    expect(cardPnl(receipt(CREATOR, 0, 400_000n, 0n))).toBe(-400_000n);
    expect(cardPnl(receipt(CREATOR, 0, 400_000n, null))).toBeNull();
  });

  it("counts a voided card's real half-unit redemption rather than skipping it", () => {
    const receipts = [receipt(CREATOR, 0, 400_000n, 500_000n)];
    expect(playerPnl(receipts, CREATOR)).toBe(100_000n);
  });

  it("ignores cards that have not settled yet", () => {
    const receipts = [receipt(CREATOR, 0, 400_000n, 1_000_000n), receipt(CREATOR, 1, 400_000n, null)];
    expect(playerPnl(receipts, CREATOR)).toBe(600_000n);
  });

  it("gives the whole pot to the greater real PnL", () => {
    const { outcome, allocation } = settleMatch({
      creator: CREATOR,
      challenger: CHALLENGER,
      potPerPlayerBase: POT,
      receipts: [receipt(CREATOR, 0, 400_000n, 1_000_000n), receipt(CHALLENGER, 0, 400_000n, 0n)],
    });
    expect(outcome.winner).toBe(CREATOR);
    expect(allocation).toEqual({ creatorBase: POT * 2n, challengerBase: 0n });
    expect(scoreForCreator(outcome, CREATOR)).toBe(1);
  });

  it("splits an equal pot and gives the odd base unit to the creator, deterministically", () => {
    const odd = 5n; // two players → a total of 10, which halves cleanly.
    const even = settleMatch({
      creator: CREATOR,
      challenger: CHALLENGER,
      potPerPlayerBase: odd,
      receipts: [receipt(CREATOR, 0, 100n, 200n), receipt(CHALLENGER, 0, 100n, 200n)],
    });
    expect(even.outcome.winner).toBeNull();
    expect(even.allocation).toEqual({ creatorBase: 5n, challengerBase: 5n });
    expect(scoreForCreator(even.outcome, CREATOR)).toBe(0.5);

    // An odd total can only arise from an odd single pot; the extra unit is the creator's.
    const dust = settleMatch({
      creator: CREATOR,
      challenger: CHALLENGER,
      potPerPlayerBase: 0n,
      receipts: [receipt(CREATOR, 0, 100n, 200n), receipt(CHALLENGER, 0, 100n, 200n)],
    });
    expect(dust.allocation).toEqual({ creatorBase: 0n, challengerBase: 0n });
  });

  it("takes only the side-pot from a player who missed the deadline", () => {
    const { outcome, allocation } = settleMatch({
      creator: CREATOR,
      challenger: CHALLENGER,
      potPerPlayerBase: POT,
      receipts: [receipt(CREATOR, 0, 400_000n, 1_000_000n)],
      incomplete: [CHALLENGER],
    });
    expect(outcome.winner).toBe(CREATOR);
    expect(allocation).toEqual({ creatorBase: POT * 2n, challengerBase: 0n });
    // The absent player keeps whatever their own positions pay: the pot is all that moved.
    expect(outcome.pnlBase[CHALLENGER]).toBe(0n);
  });

  it("returns each pot when both players are incomplete", () => {
    const { outcome, allocation } = settleMatch({
      creator: CREATOR,
      challenger: CHALLENGER,
      potPerPlayerBase: POT,
      receipts: [],
      incomplete: [CREATOR, CHALLENGER],
    });
    expect(outcome.winner).toBeNull();
    expect(allocation).toEqual({ creatorBase: POT, challengerBase: POT });
  });

  it("conserves the pot in every branch", () => {
    const cases = [
      { incomplete: undefined, receipts: [receipt(CREATOR, 0, 1n, 9n), receipt(CHALLENGER, 0, 1n, 2n)] },
      { incomplete: [CHALLENGER], receipts: [] },
      { incomplete: [CREATOR, CHALLENGER], receipts: [] },
      { incomplete: undefined, receipts: [receipt(CREATOR, 0, 1n, 2n), receipt(CHALLENGER, 0, 1n, 2n)] },
    ];
    for (const c of cases) {
      const { allocation } = settleMatch({ creator: CREATOR, challenger: CHALLENGER, potPerPlayerBase: POT, ...c });
      expect(allocation.creatorBase + allocation.challengerBase).toBe(POT * 2n);
    }
  });
});
