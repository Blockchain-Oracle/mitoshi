// /games/lucky — the machine: three reels draw a live Window, a side and a reach; the lever places one real call
// (R4-9, D-227; Owarine 90a91d71 app/games/lucky, Masayume 68f7a09's commit-reveal draw).
import { LuckyIsland } from "@/features/games/GamesIsland";

export const metadata = { title: "Lucky" };

export default function GamesLuckyPage() {
  return <LuckyIsland />;
}
