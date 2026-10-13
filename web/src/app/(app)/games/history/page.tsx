// /games/history — your replayed arcade runs and Lucky draws, each from its own record (R4-9, D-227; Owarine 90a91d71
// app/games/history).
import { GamesHistory } from "@/features/games/history/GamesHistory";

export const metadata = { title: "History" };

export default function GamesHistoryPage() {
  return <GamesHistory />;
}
