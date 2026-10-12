// /games/practice — Owarine 90a91d71's swipe deck on Mitoshi's live Windows, no stake (P4, D-223).
import { PracticeIsland } from "@/features/games/GamesIsland";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/games/practice").title };

export default function Page() {
  return <PracticeIsland />;
}
