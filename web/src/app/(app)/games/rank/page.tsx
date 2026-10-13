// /games/rank — the arcade boards and the venue's streaks on real records (R4-9, D-227; Owarine 90a91d71 app/games/rank).
import { RankIsland } from "@/features/games/GamesIsland";

export const metadata = { title: "Rank" };

export default function GamesRankPage() {
  return <RankIsland />;
}
