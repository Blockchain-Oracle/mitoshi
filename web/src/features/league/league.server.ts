import "server-only";
// The season league's read (S13 step 11; D-195): this week's points for every wallet the leaderboard knows, from the
// same settled-rounds snapshot (no extra database read), and one wallet's points, rank, percentile and league.
import { USD_DECIMALS } from "@cwf/core";
import { scoreWeek, seasonWeek, standing, type LeagueScore, type Standing } from "@cwf/core/league";
import { settledSnapshot } from "@/features/leaderboard/board.server";

export interface LeaguePayload extends LeagueScore, Standing {
  week: { startSec: number; endSec: number };
  computedAtMs: number;
}

export async function readLeague(wallet: string, nowSec = Math.floor(Date.now() / 1000)): Promise<LeaguePayload> {
  const snap = await settledSnapshot();
  const week = seasonWeek(nowSec);
  const scores = new Map<string, LeagueScore>();
  for (const [owner, list] of snap.rounds) {
    scores.set(owner, scoreWeek(list.map((r) => ({ atSec: Math.floor(r.settledAtMs / 1000), pnlBase: BigInt(r.pnl), stakeBase: BigInt(r.stake) })), week, USD_DECIMALS));
  }
  const mine = scores.get(wallet.toLowerCase()) ?? { points: 0, categories: [] };
  return { ...mine, ...standing(mine.points, [...scores.values()].map((s) => s.points)), week, computedAtMs: snap.computedAtMs };
}
