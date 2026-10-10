import "server-only";
/**
 * A wallet's public record for its profile (S5 owns the profile component; `/u/[address]` is S13's route, its calls
 * and takes join there): its settled rounds from the index (`readSettledRounds` for one owner, D-215's who-counts),
 * ranked by core's `rankTraders` as the leaderboard ranks, its current run, its place on the all-time P&L board, and
 * its latest settled Windows. A house key says so instead of showing a record. Cached for minutes per address; a
 * failed read throws so the cache never keeps it.
 */
import { cacheLife } from "next/cache";
import { rankTraders, winStreaks, type Address, type RankRound } from "@cwf/core";
import { readSettledRounds, type RoundRow } from "@cwf/db/idx";
import { readBoard } from "@/features/leaderboard/board.server";
import { db } from "@/server/db";
import { demandAddresses } from "@/server/demand";

export interface ProfileRound {
  market: string;
  symbol: string;
  cadenceSec: number;
  outcome: RoundRow["outcome"];
  pnlBase: string;
  settledSec: number;
}

export interface Profile {
  address: string;
  house: boolean;
  rounds: number;
  wins: number;
  losses: number;
  pnlBase: string;
  stakeBase: string;
  roiBps: number | null;
  winRatePct: number;
  bestStreak: number;
  currentStreak: number;
  /** Its place on the all-time P&L board, and how many wallets the board ranks; null with no settled round. */
  rank: number | null;
  of: number;
  recent: ProfileRound[];
  computedAtMs: number;
}

const RECENT = 12;

/** One cache entry per wallet, whatever the case of the address in the link. */
export function readProfile(address: string): Promise<Profile> {
  return cachedProfile(address.toLowerCase());
}

async function cachedProfile(owner: string): Promise<Profile> {
  "use cache";
  cacheLife("minutes");
  const who = demandAddresses();
  const empty = { rounds: 0, wins: 0, losses: 0, pnlBase: "0", stakeBase: "0", roiBps: null, winRatePct: 0, bestStreak: 0, currentStreak: 0, rank: null, of: 0, recent: [] };
  if ([...who.house, ...who.vaults, ...who.products].includes(owner)) return { address: owner, house: true, ...empty, computedAtMs: Date.now() };
  const [rows, board] = await Promise.all([readSettledRounds(db(), { ...who, owner }), readBoard("all", "pnl", owner)]);
  const rounds: RankRound[] = rows.map((r) => ({ pnlBase: r.proceedsBase + r.payoutBase - r.stakeBase, stakeBase: r.stakeBase, outcome: r.outcome, settledAtMs: r.settledSec * 1000, expirySec: r.settledSec }));
  const ranking = rankTraders(new Map([[owner as Address, rounds]]), { windowStartMs: 0, windowEndMs: Date.now() + 1 }).rankings[0];
  const place = board.rankings.find((r) => r.owner === owner) ?? board.you;
  const wins = rounds.filter((r) => r.outcome === "win").length;
  return {
    address: owner,
    house: false,
    rounds: rounds.length,
    wins,
    losses: rounds.filter((r) => r.outcome === "loss").length,
    pnlBase: String(ranking?.pnlBase ?? 0n),
    stakeBase: String(ranking?.volumeBase ?? 0n),
    roiBps: ranking?.roiBps ?? null,
    winRatePct: ranking?.winRatePct ?? 0,
    bestStreak: ranking?.bestStreak ?? 0,
    currentStreak: winStreaks(rounds).current,
    rank: place?.rank ?? null,
    of: board.totalWallets,
    recent: [...rows]
      .sort((a, b) => b.settledSec - a.settledSec)
      .slice(0, RECENT)
      .map((r) => ({ market: r.market, symbol: r.symbol, cadenceSec: r.cadenceSec, outcome: r.outcome, pnlBase: String(r.proceedsBase + r.payoutBase - r.stakeBase), settledSec: r.settledSec })),
    computedAtMs: Date.now(),
  };
}
