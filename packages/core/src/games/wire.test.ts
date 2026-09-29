// Ported from Masayume 68f7a09:packages/core/src/games/wire.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";
import { arenaPickKey } from "./arena";
import { reduce, type MatchEvent, type MatchState } from "./lifecycle";
import type { CardReceipt, DeckCard } from "./types";
import { decodeMatchState, encodeMatchState, wireMatchStateSchema } from "./wire";

const CREATOR = "0xaaaa111111111111111111111111111111111111" as Address;
const CHALLENGER = "0xbbbb111111111111111111111111111111111111" as Address;
const PLAYERS = { creator: CREATOR, challenger: CHALLENGER };
const MATCH_ID = "0xm1";
const COMMITMENT = { hash: `0x${"ab".repeat(32)}` as Bytes32, size: 3, policyVersion: 1 };

const CARDS: readonly DeckCard[] = [0, 1, 2].map((i) => ({
  index: i,
  marketId: toMarketId(`0x${String(i + 1).padStart(64, "0")}`),
  asset: "BTC",
  intervalSec: 900,
  expirySec: 1_700_000_900 + i * 60,
}));

function receipt(player: Address, cardIndex: number, payoutBase: bigint | null = null): CardReceipt {
  return { cardIndex, player, pick: "up", quantity: 10n ** 20n, costBase: 12_345_678_901_234_567_890n, payoutBase, pickKey: arenaPickKey(50_312, MATCH_ID, cardIndex, player === CREATOR ? 0 : 1) };
}

const TO_PICKING: readonly MatchEvent[] = [
  { kind: "open", mode: "ranked", tier: "t5" },
  { kind: "queue", nowMs: 1_000, clientSeedCommitment: "0xseed" },
  { kind: "paired", matchId: "0xm1", players: PLAYERS },
  { kind: "commitmentPublished", commitment: COMMITMENT },
  { kind: "deckRevealed", cards: CARDS },
  { kind: "pickingOpened", deadlineMs: 90_000 },
];

const ALL_PICKS: readonly MatchEvent[] = [CREATOR, CHALLENGER].flatMap((p) =>
  CARDS.map((c) => ({ kind: "pickConfirmed", receipt: receipt(p, c.index) }) as MatchEvent),
);

/** One state per phase, so the codec is exercised against the whole union rather than the happy path. */
const STATES: Readonly<Record<string, MatchState>> = {
  idle: reduce([]),
  readiness: reduce(TO_PICKING.slice(0, 1)),
  queued: reduce(TO_PICKING.slice(0, 2)),
  matched: reduce(TO_PICKING.slice(0, 3)),
  committed: reduce(TO_PICKING.slice(0, 4)),
  revealed: reduce(TO_PICKING.slice(0, 5)),
  picking: reduce(TO_PICKING),
  locked: reduce(ALL_PICKS, reduce(TO_PICKING)),
  settling: reduce([{ kind: "cardSettled", receipt: receipt(CREATOR, 0, 300n) }], reduce(ALL_PICKS, reduce(TO_PICKING))),
  finalized: reduce(
    [{ kind: "finalized", outcome: { winner: CREATOR, pnlBase: { [CREATOR]: 200n, [CHALLENGER]: -100n } } }],
    reduce(ALL_PICKS, reduce(TO_PICKING)),
  ),
  cancelled: reduce([{ kind: "leaveQueue" }], reduce(TO_PICKING.slice(0, 2))),
  expired: reduce([{ kind: "queueExpired" }], reduce(TO_PICKING.slice(0, 2))),
  refunded: reduce([{ kind: "refunded", reason: "reveal-unavailable" }], reduce(TO_PICKING.slice(0, 4))),
  forfeited: reduce([{ kind: "pickDeadlinePassed", incomplete: [CHALLENGER] }], reduce(TO_PICKING)),
};

describe("the match wire form", () => {
  it("round-trips every phase through JSON", () => {
    for (const [name, state] of Object.entries(STATES)) {
      expect(state.phase, name).toBe(name);
      const json = JSON.parse(JSON.stringify(encodeMatchState(state))) as unknown;
      expect(decodeMatchState(json), name).toEqual(state);
    }
  });

  it("encodes to something the schema accepts — the check that makes the copying encoder safe", () => {
    for (const [name, state] of Object.entries(STATES)) {
      expect(wireMatchStateSchema.safeParse(encodeMatchState(state)).success, name).toBe(true);
    }
  });

  it("keeps base units exact past 2^53, where a number would not", () => {
    const wire = encodeMatchState(STATES.settling as MatchState);
    const json = JSON.stringify(wire);
    expect(json).toContain('"costBase":"12345678901234567890"');
    const back = decodeMatchState(JSON.parse(json));
    const first = "receipts" in back ? back.receipts[0] : null;
    expect(first?.costBase).toBe(12_345_678_901_234_567_890n);
    expect(first?.quantity).toBe(10n ** 20n);
  });

  it("carries a negative PnL, because half of every finalized match has one", () => {
    const back = decodeMatchState(JSON.parse(JSON.stringify(encodeMatchState(STATES.finalized as MatchState))));
    expect(back.phase).toBe("finalized");
    if (back.phase !== "finalized") return;
    expect(back.outcome.pnlBase[CHALLENGER]).toBe(-100n);
    expect(back.outcome.winner).toBe(CREATOR);
  });

  it("refuses a snapshot whose card is not a market id, rather than branding it", () => {
    const wire = encodeMatchState(STATES.picking as MatchState) as { cards: { marketId: string }[] };
    wire.cards[0]!.marketId = "0xnope";
    expect(() => decodeMatchState(wire)).toThrow();
  });

  it("refuses a cost that is not a whole number of base units", () => {
    const wire = encodeMatchState(STATES.locked as MatchState) as { receipts: { costBase: string }[] };
    wire.receipts[0]!.costBase = "1.5";
    expect(() => decodeMatchState(wire)).toThrow();
  });
});
