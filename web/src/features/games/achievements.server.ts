import "server-only";
import { achievementsOf, type Achievement, type PlayerGameFacts } from "@cwf/core/games";
import type { ArcadeGame } from "@cwf/core/games/arcade";
import { createPgArcadeStore, createPgLuckyStore } from "@cwf/db";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { duelStandings } from "./duel/duel.server";

/**
 * A wallet's badges (R4-9, D-227; ported from Owarine 90a91d71 web/src/features/games/achievements.server.ts), gathered
 * from records that already exist — its replayed arcade runs, its Lucky draws the chain settled, and its duels as the
 * arena decided them (the ladder replayed over every decided duel). No counter of its own, so a badge cannot drift
 * from the record it claims.
 */
export interface AchievementsWire {
  configured: boolean;
  achievements: readonly Achievement[];
  earned: number;
}

export async function achievementsFor(wallet: string | null): Promise<AchievementsWire> {
  const facts: PlayerGameFacts = { duelsFinished: 0, duelsWon: 0, stakedDuelsWon: 0, rating: null, verifiedMatches: 0, arcadeScored: [], luckyDrawsSettled: 0, luckyDrawsWon: 0 };
  const configured = Boolean(serverEnv().databaseUrl);
  if (configured && wallet) {
    const [runs, draws, duels] = await Promise.all([createPgArcadeStore(db()).byWallet(wallet, 100), createPgLuckyStore(db()).history(wallet, 200), duelStandings({ everyone: true })]);
    const mine = duels.rows.find((r) => r.wallet === wallet.toLowerCase());
    if (mine) {
      facts.duelsFinished = mine.finished;
      facts.duelsWon = mine.won;
      facts.stakedDuelsWon = mine.stakedWon;
      facts.verifiedMatches = mine.verifiedMatches;
      facts.rating = mine.verifiedMatches > 0 ? mine.rating : null;
    }
    facts.arcadeScored = [...new Set(runs.map((r) => r.game))] as ArcadeGame[];
    const settled = draws.filter((d) => d.result === "won" || d.result === "lost" || d.result === "cashed-out");
    facts.luckyDrawsSettled = settled.length;
    facts.luckyDrawsWon = settled.filter((d) => d.result === "won").length;
  }
  const achievements = achievementsOf(facts);
  return { configured, achievements, earned: wallet ? achievements.filter((a) => a.earned).length : 0 };
}
