// Ported from Owarine 90a91d71:packages/core/src/games/achievements.ts (R4-9, D-227).
import type { ArcadeGame } from "./arcade/field";


/**
 * What a player has actually done, and the badges that follow from it.
 *
 * Every rule is a plain predicate over facts already recorded elsewhere: duels the projector wrote from the arena's
 * own events, arcade scores the room's token vouched for, lucky draws the venue settled. Nothing here is a counter of
 * its own, so a badge can never drift from the record it claims — and a wallet that plays on another device arrives
 * with the same badges, because the facts are the chain's and the store's, not the browser's.
 *
 * Pure: the caller gathers the facts.
 */
export interface PlayerGameFacts {
  /** Duels that reached a terminal state, refunds included: a refund is not a game played, and the rules say so. */
  duelsFinished: number;
  duelsWon: number;
  /** Won a duel whose tier escrowed a pot, as against a free one. */
  stakedDuelsWon: number;
  /** The ladder's own figures. A wallet that never played a ranked duel has none. */
  rating: number | null;
  verifiedMatches: number;
  /** The arcade games this wallet has a verified score in. */
  arcadeScored: readonly ArcadeGame[];
  /** Lucky draws that reached a result, and the ones that came in. */
  luckyDrawsSettled: number;
  luckyDrawsWon: number;
}

export const NO_GAME_FACTS: PlayerGameFacts = { duelsFinished: 0, duelsWon: 0, stakedDuelsWon: 0, rating: null, verifiedMatches: 0, arcadeScored: [], luckyDrawsSettled: 0, luckyDrawsWon: 0 };

export type AchievementId =
  | "first-duel"
  | "first-win"
  | "staked-win"
  | "five-duels"
  | "rated"
  | "climber"
  | "arcade-debut"
  | "arcade-both"
  | "lucky-settled"
  | "lucky-won";

export interface Achievement {
  id: AchievementId;
  title: string;
  /** What it takes, in the player's own terms. Shown whether or not it is earned, so a locked badge is a goal. */
  how: string;
  /** Progress towards it: `have` of `need`. Earned when `have >= need`. */
  have: number;
  need: number;
  earned: boolean;
}

interface Rule {
  id: AchievementId;
  title: string;
  how: string;
  need: number;
  have: (facts: PlayerGameFacts) => number;
}

/** The order badges are shown in: the first duel first, the rarest last. */
const RULES: readonly Rule[] = [
  { id: "first-duel", title: "First hand", how: "Finish a duel", need: 1, have: (f) => f.duelsFinished },
  { id: "first-win", title: "Winner", how: "Win a duel", need: 1, have: (f) => f.duelsWon },
  { id: "five-duels", title: "Regular", how: "Finish five duels", need: 5, have: (f) => f.duelsFinished },
  { id: "staked-win", title: "Played for it", how: "Win a duel with a pot on the table", need: 1, have: (f) => f.stakedDuelsWon },
  { id: "rated", title: "On the ladder", how: "Have a ranked duel verified by the settler", need: 1, have: (f) => f.verifiedMatches },
  { id: "climber", title: "Above the line", how: "Hold a rating over 1000", need: 1, have: (f) => (f.rating !== null && f.rating > 1_000 ? 1 : 0) },
  { id: "arcade-debut", title: "Arcade debut", how: "Post a verified score in an arcade game", need: 1, have: (f) => f.arcadeScored.length },
  { id: "arcade-both", title: "Both machines", how: "Post a verified score in both arcade games", need: 2, have: (f) => f.arcadeScored.length },
  { id: "lucky-settled", title: "Rolled the dice", how: "Settle a Lucky Draw", need: 1, have: (f) => f.luckyDrawsSettled },
  { id: "lucky-won", title: "Lucky", how: "Win a Lucky Draw", need: 1, have: (f) => f.luckyDrawsWon },
];

/** Every badge, earned or not, with the progress towards it. A locked badge names what it takes rather than hiding. */
export function achievementsOf(facts: PlayerGameFacts): readonly Achievement[] {
  return RULES.map((rule) => {
    const have = Math.max(0, Math.min(rule.have(facts), rule.need));
    return { id: rule.id, title: rule.title, how: rule.how, have, need: rule.need, earned: have >= rule.need };
  });
}

export function achievementsEarned(list: readonly Achievement[]): number {
  return list.filter((a) => a.earned).length;
}
