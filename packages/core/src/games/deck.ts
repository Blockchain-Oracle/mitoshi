// Ported from Masayume 68f7a09:packages/core/src/games/deck.ts
import type { MarketId } from "../types/market";
import type { DeckCard } from "./types";

/**
 * The deckmaster's selection rule, pure so it can be tested without a venue.
 *
 * The owner approved the recommended policy: three to five distinct 15m Windows, widening to 1h only
 * when fewer than three qualify, and **never 5m** until live timing proves the whole swipe-and-signature
 * path fits inside one (`06-game-architecture.md` §Owner decisions 4). The headroom rule is Flicky's —
 * soonest-settling first, but only Windows with real time left, so a deck cannot be dealt cards that
 * lock before a player can reach them.
 *
 * **The mixed lane is not a third preference; it is what the venue forced.** Driven live on Shannon on
 * 2026-09-03, the venue runs two assets, one Window per cadence: at any moment there are exactly two
 * live 15m Windows and two live 1h ones, so a three-card deck of a single cadence is not merely rare —
 * it is impossible. Refusing to deal would have made the duel undeliverable. The single-cadence lanes
 * stay first because they are the nicest to read, and a mixed deck is dealt only when neither has three.
 *
 * What the single-cadence rule was protecting is protected by the filters that remain: every card must
 * be tradable now, must still have real life left, and must settle inside the match horizon — so a
 * mixed deck varies in how long each card runs, never in whether a player can reach it. Both players
 * hold identical cards either way; the asymmetry a mixed deck introduces is between cards, not between
 * players, and each card carries its own countdown on the stage.
 */

/**
 * Two, not three, and the reason is the venue's supply rather than a preference.
 *
 * Somnia runs two assets with one Window per cadence, so a cadence yields at most TWO live Windows —
 * and the 15m cadence is too short to absorb the arena's own deadlines (join + reveal + card life is
 * 540s of a 900s cycle at the deployed parameters), which leaves the 1h pair as the dependable supply.
 * At three, a deck was dealable 40% of the time; at two, 90% (owner's decision, 2026-09-03, measured by
 * `spike:supply`). Doc 06 §Owner decisions 4 said three to five; this is the approved deviation.
 *
 * A two-card duel is a coarser contest — more ties, more luck — which is why it stays the floor rather
 * than the target: `selectDeck` still takes every eligible Window up to `DECK_MAX`, so a deck is four
 * cards whenever the venue has four.
 */
export const DECK_MIN = 2;
export const DECK_MAX = 5;
export const INTERVAL_15M_SEC = 900;
export const INTERVAL_1H_SEC = 3_600;
/** Excluded by policy, not by capability: 5m returns only with a measured end-to-end timing. */
export const INTERVAL_5M_SEC = 300;
/**
 * A card must still have this long to run when the deck is dealt.
 *
 * A default, not the rule: the real figure is the arena's own `minCardLifeSec` plus its join, reveal and
 * pick windows, because the contract checks card life at REVEAL and again at every PICK, and a reveal may
 * legally land after the join and reveal windows have elapsed. The deckmaster computes it from the
 * deployed parameters; this constant is only what a caller gets for not saying.
 */
export const MIN_HEADROOM_SEC = 600;

export interface DeckCandidate {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  /** The venue's own trading status, already normalised by the market port. */
  trading: boolean;
  /** Top-of-book spread and resting depth, per whole unit — the deckmaster refuses an unfillable card. */
  spreadRaw: bigint;
  depthRaw: bigint;
}

export interface DeckPolicy {
  supportedAssets: readonly string[];
  maxSpreadRaw: bigint;
  minDepthRaw: bigint;
  /** Every card must settle inside the match's own horizon, or the duel outlives its players' patience. */
  horizonSec: number;
  minHeadroomSec?: number;
  /**
   * The cadences a deck may draw, when the venue says so (R4-9, D-227). Absent: Masayume's rule — never 5m. Mitoshi's
   * Windows run 5 minutes only, and its arena's windows were sized to fit one (30 s join, 30 s reveal, 120 s card
   * life), so its policy names `[300]`: the measured-timing condition is the arena's own parameters, not a guess.
   */
  cadences?: readonly number[];
}

/** Mitoshi's deck policy version (the commitment binds it): 2 = 5-minute Windows, sized to the arena's own windows. */
export const DUEL_POLICY_VERSION = 2;

export type DeckRefusal = { kind: "too-few-eligible"; eligible: number; needed: number };

/** What the deck turned out to be, recorded so a session can see when the venue was thin. Descriptive. */
export type DeckLane = "5m" | "15m" | "1h" | "mixed";

export type DeckSelection = { ok: true; cards: readonly DeckCard[]; lane: DeckLane } | { ok: false; refusal: DeckRefusal };

function isEligible(candidate: DeckCandidate, policy: DeckPolicy, nowSec: number): boolean {
  if (!candidate.trading) return false;
  if (policy.cadences ? !policy.cadences.includes(candidate.intervalSec) : candidate.intervalSec === INTERVAL_5M_SEC) return false;
  if (!policy.supportedAssets.includes(candidate.asset)) return false;
  if (candidate.spreadRaw > policy.maxSpreadRaw) return false;
  if (candidate.depthRaw < policy.minDepthRaw) return false;
  const left = candidate.expirySec - nowSec;
  return left >= (policy.minHeadroomSec ?? MIN_HEADROOM_SEC) && left <= policy.horizonSec;
}

/** Soonest-settling first, then by market id so two deckmasters on the same set deal the same deck. */
function byUrgency(a: DeckCandidate, b: DeckCandidate): number {
  return a.expirySec - b.expirySec || a.marketId.localeCompare(b.marketId);
}

function distinctWindows(candidates: readonly DeckCandidate[]): DeckCandidate[] {
  const seen = new Set<MarketId>();
  const out: DeckCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.marketId)) continue;
    seen.add(candidate.marketId);
    out.push(candidate);
  }
  return out;
}

function toCards(candidates: readonly DeckCandidate[]): readonly DeckCard[] {
  return candidates.slice(0, DECK_MAX).map((c, index) => ({
    index,
    marketId: c.marketId,
    asset: c.asset,
    intervalSec: c.intervalSec,
    expirySec: c.expirySec,
  }));
}

function laneOf(cards: readonly DeckCard[]): DeckLane {
  const cadences = new Set(cards.map((card) => card.intervalSec));
  if (cadences.size > 1) return "mixed";
  return cadences.has(INTERVAL_5M_SEC) ? "5m" : cadences.has(INTERVAL_15M_SEC) ? "15m" : "1h";
}

/**
 * When a deck could next be dealt, in seconds from `nowSec`, or null if not within `withinSec`.
 *
 * The venue's schedule is deterministic — a Window expires at E and its successor runs E → E+interval —
 * so a queue can say "next deck in 3:12" rather than "waiting", which is the difference between a
 * product that is briefly unavailable and one that looks broken. Projection is a per-second scan because
 * the candidate set is four items and the span is minutes; the arithmetic to solve it in closed form
 * would be longer than the loop and wrong at the boundaries.
 */
export function nextDealableSec(candidates: readonly DeckCandidate[], policy: DeckPolicy, nowSec: number, withinSec = 900): number | null {
  for (let ahead = 1; ahead <= withinSec; ahead += 1) {
    const at = nowSec + ahead;
    const eligible = candidates.filter((candidate) => {
      // The successor Window of the same series, once this one has expired.
      let expirySec = candidate.expirySec;
      while (expirySec <= at) expirySec += candidate.intervalSec;
      return isEligible({ ...candidate, expirySec, trading: true }, policy, at);
    });
    if (distinctWindows(eligible).length >= DECK_MIN) return ahead;
  }
  return null;
}

/**
 * Deals a deck: every eligible Window, soonest-settling first, up to five.
 *
 * There is no cadence preference any more, and removing it was forced by the floor moving to two. A rule
 * that preferred a single cadence would deal a TWO-card deck while four Windows sat eligible, because two
 * is now enough to satisfy it — a worse contest for no reason. Taking everything gives four cards when the
 * venue has four and two when it has two, which is what the owner approved on 2026-09-03.
 *
 * The cost is that a mixed deck's last card settles later than its first, so the pot waits on the slowest
 * — up to `horizonSec`. That is bounded rather than unbounded, and it is why the horizon is an hour: the
 * player swipes in one sitting, and the cards then resolve one at a time through `settlement.progress`.
 */
export function selectDeck(candidates: readonly DeckCandidate[], policy: DeckPolicy, nowSec: number): DeckSelection {
  const eligible = distinctWindows(candidates.filter((c) => isEligible(c, policy, nowSec)).sort(byUrgency));
  if (eligible.length < DECK_MIN) return { ok: false, refusal: { kind: "too-few-eligible", eligible: eligible.length, needed: DECK_MIN } };
  const cards = toCards(eligible);
  return { ok: true, cards, lane: laneOf(cards) };
}
