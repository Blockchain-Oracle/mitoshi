// `/leaderboard` (S5, L-48): S5 replaces the registered pending page with the ranked board (`features/leaderboard`).
// A static shell; the board streams in client-side from `/api/leaderboard`.
import type { Metadata } from "next";
import { LeaderboardPage } from "@/features/leaderboard/LeaderboardPage";

export const metadata: Metadata = { title: "Leaderboard", description: "Wallets ranked by what settled on Mitoshi: P&L and ROI, daily to all time, from the engine's own records." };

export default function Page() {
  return <LeaderboardPage />;
}
