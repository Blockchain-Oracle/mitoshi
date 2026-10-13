// `/portfolio/edge` (S5, L-47): Trader Edge — the account's settled Windows as a record of what pays, what costs and
// when it trades best (`features/edge`). R6 money (T10 + S06, D-230): signed out it shows a real top trader's report —
// the all-time board's most-settled profitable wallet that isn't the house's (`pickExemplar`), read on the server at
// request time from the board's shared snapshot and streamed in under the page's own frame.
import { HOUSE_TRADERS } from "@cwf/core";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { EdgePage } from "@/features/edge/EdgePage";
import { pickExemplar, type Exemplar } from "@/features/edge/exemplar";
import { readBoard } from "@/features/leaderboard/board.server";
import { serverEnv } from "@/server/env";

export const metadata: Metadata = { title: "Trader Edge", description: "Your settled Mitoshi Windows as a record: net result, win rate, profit factor, deepest slide and when you trade best." };

async function exemplar(): Promise<Exemplar | null> {
  try {
    const board = await readBoard("all", "pnl");
    const house = new Set(HOUSE_TRADERS[serverEnv().network].map((a) => a.toLowerCase()));
    return pickExemplar(board.rankings, house, board.totalWallets);
  } catch {
    return null;
  }
}

async function WithExemplar() {
  await connection();
  return <EdgePage exemplar={await exemplar()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<EdgePage />}>
      <WithExemplar />
    </Suspense>
  );
}
