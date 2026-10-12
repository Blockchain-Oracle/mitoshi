// /games — Owarine 90a91d71's hub (P4, D-223): every mode, whose money is at risk in each, and what each waits on.
import { GamesHubIsland } from "@/features/games/GamesIsland";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/games").title };

export default function Page() {
  return <GamesHubIsland />;
}
