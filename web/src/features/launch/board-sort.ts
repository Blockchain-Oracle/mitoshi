// The launch board's tabs (R6 money, S08; D-230): four orders over the index's rows. Trending — the most 24 h volume,
// then the most 24 h trades, then the newest; New — the newest; Graduating — memecoins still on the curve, furthest
// along first; Graduated — completed or on Uniswap, the latest first (a completed coin, graduating now, leads).
// Stablecoins list in Trending and New only. Pure; amounts compared as bigints.
import type { LaunchBoardRowWire } from "@cwf/core";

export type BoardSort = "trending" | "new" | "graduating" | "graduated";
export const BOARD_SORTS: readonly BoardSort[] = ["trending", "new", "graduating", "graduated"];

export const isBoardSort = (v: unknown): v is BoardSort => typeof v === "string" && (BOARD_SORTS as readonly string[]).includes(v);

const byNewest = (a: LaunchBoardRowWire, b: LaunchBoardRowWire) => b.createdSec - a.createdSec || a.token.localeCompare(b.token);
const cmpBig = (a: string, b: string) => {
  const x = BigInt(a);
  const y = BigInt(b);
  return x === y ? 0 : x > y ? -1 : 1;
};

export function sortBoard(rows: readonly LaunchBoardRowWire[], sort: BoardSort): LaunchBoardRowWire[] {
  switch (sort) {
    case "trending":
      return [...rows].sort((a, b) => cmpBig(a.vol24hBase, b.vol24hBase) || b.trades24h - a.trades24h || byNewest(a, b));
    case "new":
      return [...rows].sort(byNewest);
    case "graduating":
      return rows.filter((r) => r.kind === "memecoin" && r.stage === "trading").sort((a, b) => b.progressBps - a.progressBps || byNewest(a, b));
    case "graduated":
      return rows
        .filter((r) => r.kind === "memecoin" && r.stage !== "trading")
        .sort((a, b) => (b.graduatedSec ?? Number.MAX_SAFE_INTEGER) - (a.graduatedSec ?? Number.MAX_SAFE_INTEGER) || byNewest(a, b));
  }
}
