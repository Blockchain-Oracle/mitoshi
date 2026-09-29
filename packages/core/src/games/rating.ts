// Ported from Masayume 68f7a09:packages/core/src/games/rating.ts
/**
 * Transparent Elo, chosen over Glicko-2 for a first small pool because it can be explained on the
 * profile screen in one sentence and tested exactly (`06-game-architecture.md` §Matchmaking).
 *
 * Two rules carry product meaning. A new player's first ten *verified* matches move at double weight so
 * the ladder finds them quickly; and a match that never produced a real result — refunded, or every card
 * voided — moves nothing at all, because a rating that punishes an operator failure or a dead Window is
 * a rating nobody trusts.
 */

export const INITIAL_RATING = 1000;
export const PROVISIONAL_MATCHES = 10;
export const K_PROVISIONAL = 48;
export const K_ESTABLISHED = 24;

export interface RatingRecord {
  rating: number;
  /** Matches that reached a real result. Refunded and void-only matches are not counted here either. */
  verifiedMatches: number;
}

export const NEW_RATING: RatingRecord = { rating: INITIAL_RATING, verifiedMatches: 0 };

/** 1 for a win, 0.5 for a split pot, 0 for a loss — the only three a duel can end on. */
export type MatchScore = 1 | 0.5 | 0;

export function kFactor(record: RatingRecord): number {
  return record.verifiedMatches < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_ESTABLISHED;
}

/** The logistic expectation that one rating beats another. */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/**
 * One player's new record after a verified result.
 *
 * Ratings are integers: a fractional ladder is noise a player cannot act on. Because the two sides can
 * hold different K values while one is provisional, an update is not strictly zero-sum — that is the
 * intended cost of letting newcomers converge fast, not an accounting bug.
 */
export function nextRating(record: RatingRecord, opponentRating: number, score: MatchScore): RatingRecord {
  const delta = kFactor(record) * (score - expectedScore(record.rating, opponentRating));
  return { rating: Math.round(record.rating + delta), verifiedMatches: record.verifiedMatches + 1 };
}

/** Whether a finished match may touch the ladder at all. */
export function isVerifiedResult(input: { refunded: boolean; settledCards: number }): boolean {
  return !input.refunded && input.settledCards > 0;
}

/**
 * Both sides of one verified result, so a caller cannot update one player and forget the other.
 * A forfeit is a real result: the player who missed the deadline scores zero.
 */
export function applyResult(
  a: RatingRecord,
  b: RatingRecord,
  scoreForA: MatchScore,
): { a: RatingRecord; b: RatingRecord } {
  const scoreForB = (1 - scoreForA) as MatchScore;
  return { a: nextRating(a, b.rating, scoreForA), b: nextRating(b, a.rating, scoreForB) };
}
