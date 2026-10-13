// Ported from Masayume 68f7a09:packages/core/src/games/practice.ts
import type { MarketId } from "../types/market";
import type { DeckCard, Pick } from "./types";

/**
 * Practice, as pure data: the deck a player learns the motion on, the opponent that is a coin flip,
 * and the rule that scores a card without any money, any chain and any invented number.
 *
 * **What practice is honest about.** A duel card is scored on the venue's own settlement — payout
 * minus the cost the arena measured around a real fill. Practice cannot wait fifteen minutes for
 * that, so it scores a different question and must say so: the card asks the Window's question, and
 * practice answers it on the **live public spot over a short watch**. Every price here is a real
 * feed reading; nothing is simulated. What is *not* claimed is that this is a settlement, a payout,
 * a position or a real opponent (`04-game-system.md` §Practice and arcade state).
 *
 * **Why every card closes 30 s after its own swipe** (R6 games §0.1). Each card records its entry price when
 * it is swiped and its close exactly `PRACTICE_WATCH_SEC` later, so the card's question — "higher in 30 s?" —
 * is true for every card, and every race has the same length whatever the deck's order. (One close moment
 * for the whole deck, as before, gave the first card swiped the longest race: five swipes over 40 s made
 * card one a 70 s race.) The round still ends 30 s after the last swipe.
 */

/** How long the round watches the live feed before it scores. Short enough to be one sitting. */
export const PRACTICE_WATCH_SEC = 30;

/** Room for the swipes themselves: five cards, deliberated over, before the watch even starts. */
export const PRACTICE_SWIPE_BUDGET_SEC = 90;

/**
 * A card must outlast the whole round — the swipes and then the watch.
 *
 * The watch alone is not enough, and the first browser pass showed why: cards are dealt
 * soonest-settling first, so the top card is the shortest-lived one, and a Window with 31 seconds
 * left was dealt, counted down to 0:00 under the player's hand and read as broken. Practice scores
 * on the feed rather than on the Window, so nothing was actually wrong with the score — but a card
 * naming a Window that has already gone is not a card anyone should be asked to play.
 */
export const PRACTICE_CARD_MIN_LIFE_SEC = PRACTICE_SWIPE_BUDGET_SEC + PRACTICE_WATCH_SEC;

/** A practice deck is whatever the venue can show, up to five — one card is enough to teach the motion. */
export const PRACTICE_DECK_MAX = 5;
export const PRACTICE_DECK_MIN = 1;

/** A live Window as practice needs it: no spread, no depth, because practice places no order. */
export interface PracticeCandidate {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  trading: boolean;
}

/** One swipe: the side, and the real feed reading at the moment it was made. */
export interface PracticePick {
  cardIndex: number;
  side: Pick;
  entryRaw: bigint;
  /** The feed's own decimals, carried with the price so a stage never assumes them. */
  decimals: number;
  atMs: number;
}

/** Where a card's asset ended up 30 s after its own swipe — one reading per card. */
export interface PracticeClose {
  cardIndex: number;
  closeRaw: bigint;
  /** When the close was read: the card's swipe plus `PRACTICE_WATCH_SEC`. */
  atMs?: number;
}

export type PracticeMove = "up" | "down" | "flat";
export type PracticeCardResult = "won" | "lost" | "flat";

export type PracticePhase =
  /** Cards are on the table and nothing has been swiped. */
  | "dealt"
  | "picking"
  /** Every card is swiped; the feed is running and nothing more can be played. */
  | "watching"
  | "scored";

export interface PracticeRound {
  phase: PracticePhase;
  /** The bot's whole hand is a function of this and the card index — see `practiceBotSide`. */
  seed: string;
  cards: readonly DeckCard[];
  picks: readonly PracticePick[];
  /** Set when the last card is swiped; null before that. */
  watchEndsAtMs: number | null;
  closes: readonly PracticeClose[];
}

export type PracticeEvent =
  | { kind: "deal"; seed: string; cards: readonly DeckCard[] }
  | { kind: "pick"; pick: PracticePick }
  /** One card's own close, read 30 s after its swipe (while the rest are still being swiped or watched). */
  | { kind: "close"; close: PracticeClose }
  /** The round's end: every pick has a close, or the watch ran out; closes given here fill any still missing. */
  | { kind: "score"; closes: readonly PracticeClose[] };

export const PRACTICE_IDLE: PracticeRound = { phase: "dealt", seed: "", cards: [], picks: [], watchEndsAtMs: null, closes: [] };

/**
 * The opponent, and the whole of it: FNV-1a over the seed and the card index, avalanched, then one bit.
 *
 * It is a coin flip and the stage says so. Anything cleverer — following the book, following the
 * player, a "difficulty" — would be a signal practice does not have, dressed as an opponent that
 * knows something. The seed is per round rather than per card so one hand is reproducible from one
 * short string, which is what makes a replay of the same deck comparable.
 *
 * **The low bit of FNV-1a is unusable and the test found it.** Multiplying by an odd prime preserves
 * bit 0, so after the whole loop that bit is nothing but the XOR of the low bits of every input byte
 * — which made `alpha` and `beta` deal the identical five-card hand. The final avalanche mixes the
 * high bits down before a bit is taken, and the bit taken is the top one.
 */
export function practiceBotSide(seed: string, cardIndex: number): Pick {
  const input = `${seed}:${cardIndex}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV-1a's 32-bit prime, as shifts, so the whole thing stays inside a 32-bit integer.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2545f491) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 31 === 0 ? "up" : "down";
}

/** Which way the feed actually went between the swipe and the close. Flat is a real third answer. */
export function practiceMove(entryRaw: bigint, closeRaw: bigint): PracticeMove {
  if (closeRaw > entryRaw) return "up";
  if (closeRaw < entryRaw) return "down";
  return "flat";
}

/** A flat feed is nobody's win. Two players on opposite sides both lose it, which is the honest answer. */
export function practiceResult(side: Pick, entryRaw: bigint, closeRaw: bigint): PracticeCardResult {
  const move = practiceMove(entryRaw, closeRaw);
  if (move === "flat") return "flat";
  return move === side ? "won" : "lost";
}

/**
 * The cards practice can deal: trading now, and still trading when the round ends.
 *
 * There is no spread or depth filter and no excluded cadence, because both exist in `selectDeck` to
 * protect a real order from an unfillable book — and practice places no order. Soonest-settling
 * first, then by market id, so the same venue minute deals the same deck twice.
 */
export function selectPracticeDeck(candidates: readonly PracticeCandidate[], nowSec: number, size = PRACTICE_DECK_MAX): readonly DeckCard[] {
  const seen = new Set<MarketId>();
  const live = candidates
    .filter((c) => c.trading && c.expirySec - nowSec > PRACTICE_CARD_MIN_LIFE_SEC)
    .sort((a, b) => a.expirySec - b.expirySec || a.marketId.localeCompare(b.marketId))
    .filter((c) => (seen.has(c.marketId) ? false : (seen.add(c.marketId), true)));

  return live.slice(0, Math.max(0, Math.min(size, PRACTICE_DECK_MAX))).map((c, index) => ({
    index,
    marketId: c.marketId,
    asset: c.asset,
    intervalSec: c.intervalSec,
    expirySec: c.expirySec,
  }));
}

/** The next card to swipe, or null when the deck is played out. Cards are played in the deck's order. */
export function nextPracticeCard(round: PracticeRound): DeckCard | null {
  const picked = new Set(round.picks.map((p) => p.cardIndex));
  return round.cards.find((card) => !picked.has(card.index)) ?? null;
}

/**
 * The practice reducer, total for the same reason the match one is: a stage replays events it may
 * already hold (a re-render, a double-fired pointer gesture), and a swipe on a card that is already
 * played must be a no-op rather than a second entry price.
 */
export function practiceTransition(round: PracticeRound, event: PracticeEvent): PracticeRound {
  if (event.kind === "deal") {
    return { phase: "dealt", seed: event.seed, cards: event.cards, picks: [], watchEndsAtMs: null, closes: [] };
  }

  if (event.kind === "pick") {
    if (round.phase !== "dealt" && round.phase !== "picking") return round;
    if (!round.cards.some((card) => card.index === event.pick.cardIndex)) return round;
    if (round.picks.some((p) => p.cardIndex === event.pick.cardIndex)) return round;
    const picks = [...round.picks, event.pick];
    if (picks.length < round.cards.length) return { ...round, phase: "picking", picks };
    return { ...round, phase: "watching", picks, watchEndsAtMs: event.pick.atMs + PRACTICE_WATCH_SEC * 1_000 };
  }

  if (event.kind === "close") {
    if (round.phase !== "picking" && round.phase !== "watching") return round;
    const picked = round.picks.some((p) => p.cardIndex === event.close.cardIndex);
    if (!picked || round.closes.some((c) => c.cardIndex === event.close.cardIndex)) return round;
    return { ...round, closes: [...round.closes, event.close] };
  }

  if (round.phase !== "watching") return round;
  const have = new Set(round.closes.map((c) => c.cardIndex));
  return { ...round, phase: "scored", closes: [...round.closes, ...event.closes.filter((c) => !have.has(c.cardIndex))] };
}

/** When a picked card's own race closes: its swipe plus the watch. */
export function practiceClosesAtMs(round: PracticeRound, cardIndex: number): number | null {
  const pick = round.picks.find((p) => p.cardIndex === cardIndex);
  return pick ? pick.atMs + PRACTICE_WATCH_SEC * 1_000 : null;
}

export interface PracticeCardScore {
  card: DeckCard;
  side: Pick;
  botSide: Pick;
  entryRaw: bigint;
  closeRaw: bigint;
  decimals: number;
  move: PracticeMove;
  you: PracticeCardResult;
  bot: PracticeCardResult;
}

export interface PracticeScore {
  cards: readonly PracticeCardScore[];
  youWon: number;
  botWon: number;
  /** Null on a tie — including the tie where a flat feed gave neither side anything. */
  winner: "you" | "bot" | null;
}

/** The scoreboard, derived rather than stored: the round holds the readings, this reads them back. */
export function practiceScore(round: PracticeRound): PracticeScore {
  const closeOf = new Map(round.closes.map((c) => [c.cardIndex, c.closeRaw]));
  const cards: PracticeCardScore[] = [];

  for (const pick of round.picks) {
    const card = round.cards.find((c) => c.index === pick.cardIndex);
    const closeRaw = closeOf.get(pick.cardIndex);
    if (!card || closeRaw === undefined) continue;
    const botSide = practiceBotSide(round.seed, pick.cardIndex);
    cards.push({
      card,
      side: pick.side,
      botSide,
      entryRaw: pick.entryRaw,
      closeRaw,
      decimals: pick.decimals,
      move: practiceMove(pick.entryRaw, closeRaw),
      you: practiceResult(pick.side, pick.entryRaw, closeRaw),
      bot: practiceResult(botSide, pick.entryRaw, closeRaw),
    });
  }

  cards.sort((a, b) => a.card.index - b.card.index);
  const youWon = cards.filter((c) => c.you === "won").length;
  const botWon = cards.filter((c) => c.bot === "won").length;
  return { cards, youWon, botWon, winner: youWon === botWon ? null : youWon > botWon ? "you" : "bot" };
}
