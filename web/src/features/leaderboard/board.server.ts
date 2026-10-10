import "server-only";
/**
 * The leaderboard's data (S5, L-48; Masayume 68f7a09 `features/leaderboard/board.server.ts`'s role): every settled
 * round from the index (`readSettledRounds`, D-215's who-counts), read once per few minutes and shared by every
 * reader, then ranked per period with core's `rankTraders` (P&L, then ROI, activity, address) or `sortByRoi`.
 * Masayume's day cap came from DreamDEX's paging; ours has Daily · Weekly · Monthly · All time (RV-86).
 */
import { cacheLife } from "next/cache";
import { rankTraders, sortByRoi, type Address, type RankRound, type TraderRanking } from "@cwf/core";
import { readSettledRounds } from "@cwf/db/idx";
import { db } from "@/server/db";
import { demandAddresses } from "@/server/demand";
import { PERIODS, type BoardPayload, type BoardRow, type BoardSort, type Period } from "./protocol";

export { PERIODS, type BoardPayload, type BoardSort, type Period };

const TOP = 50;

interface Snapshot {
  computedAtMs: number;
  /** Wallet → rounds, with base units as strings so the snapshot survives the cache's serialisation. */
  rounds: [string, { pnl: string; stake: string; outcome: RankRound["outcome"]; settledAtMs: number; expirySec: number }[]][];
}

/** Throws on a failed read, so the cache never keeps one. */
async function snapshot(): Promise<Snapshot> {
  "use cache";
  cacheLife("minutes");
  const rows = await readSettledRounds(db(), demandAddresses());
  const by = new Map<string, Snapshot["rounds"][number][1]>();
  for (const r of rows) {
    const list = by.get(r.owner) ?? [];
    list.push({ pnl: String(r.proceedsBase + r.payoutBase - r.stakeBase), stake: String(r.stakeBase), outcome: r.outcome, settledAtMs: r.settledSec * 1000, expirySec: r.settledSec });
    by.set(r.owner, list);
  }
  return { computedAtMs: Date.now(), rounds: [...by.entries()] };
}

const row = (r: TraderRanking, i: number): BoardRow => ({
  rank: i + 1,
  owner: r.owner,
  pnlBase: r.pnlBase.toString(),
  roiBps: r.roiBps,
  winRatePct: r.winRatePct,
  tradeCount: r.tradeCount,
  settledTrades: r.settledTrades,
  bestStreak: r.bestStreak,
  volumeBase: r.volumeBase.toString(),
});

export async function readBoard(period: Period, sort: BoardSort, you?: string): Promise<BoardPayload> {
  const s = await snapshot();
  const byWallet = new Map<Address, RankRound[]>(
    s.rounds.map(([owner, list]) => [owner as Address, list.map((x) => ({ pnlBase: BigInt(x.pnl), stakeBase: BigInt(x.stake), outcome: x.outcome, settledAtMs: x.settledAtMs, expirySec: x.expirySec }))]),
  );
  const span = PERIODS[period];
  const now = Date.now();
  const ranked = rankTraders(byWallet, { windowStartMs: Number.isFinite(span) ? now - span : 0, windowEndMs: now + 1 });
  const ordered = sort === "roi" ? sortByRoi(ranked.rankings) : ranked.rankings;
  const rows = ordered.map(row);
  const mine = you ? rows.find((r) => r.owner === you.toLowerCase()) ?? null : null;
  return {
    period,
    sort,
    computedAtMs: s.computedAtMs,
    closedCalls: ranked.closedCalls,
    totalWallets: ranked.totalWallets,
    rankings: rows.slice(0, TOP),
    you: mine && mine.rank > TOP ? mine : null,
  };
}
