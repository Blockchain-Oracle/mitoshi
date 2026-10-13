import "server-only";
import { achievementsOf, type Achievement, type AchievementId, type PlayerGameFacts } from "@cwf/core/games";
import type { ArcadeGame } from "@cwf/core/games/arcade";
import { createPgArcadeStore, createPgLuckyStore } from "@cwf/db";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";

/**
 * A wallet's badges (R4-9, D-227; ported from Owarine 90a91d71 web/src/features/games/achievements.server.ts), gathered
 * from records that already exist — its replayed arcade runs and its Lucky draws the chain settled. No counter of its
 * own, so a badge cannot drift from the record it claims. The duel's six badges join with the arena (Duel is "Soon"):
 * a shelf of goals no mode can reach yet would be a promise, not a record.
 */
export interface AchievementsWire {
  configured: boolean;
  achievements: readonly Achievement[];
  earned: number;
}

const WITH_THE_ARENA: ReadonlySet<AchievementId> = new Set(["first-duel", "first-win", "staked-win", "five-duels", "rated", "climber"]);

export async function achievementsFor(wallet: string | null): Promise<AchievementsWire> {
  const facts: PlayerGameFacts = { duelsFinished: 0, duelsWon: 0, stakedDuelsWon: 0, rating: null, verifiedMatches: 0, arcadeScored: [], luckyDrawsSettled: 0, luckyDrawsWon: 0 };
  const configured = Boolean(serverEnv().databaseUrl);
  if (configured && wallet) {
    const [runs, draws] = await Promise.all([createPgArcadeStore(db()).byWallet(wallet, 100), createPgLuckyStore(db()).history(wallet, 200)]);
    facts.arcadeScored = [...new Set(runs.map((r) => r.game))] as ArcadeGame[];
    const settled = draws.filter((d) => d.result === "won" || d.result === "lost" || d.result === "cashed-out");
    facts.luckyDrawsSettled = settled.length;
    facts.luckyDrawsWon = settled.filter((d) => d.result === "won").length;
  }
  const achievements = achievementsOf(facts).filter((a) => !WITH_THE_ARENA.has(a.id));
  return { configured, achievements, earned: wallet ? achievements.filter((a) => a.earned).length : 0 };
}
