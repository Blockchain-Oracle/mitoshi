// /games/duel — the versus on the arena (R4-9, D-227): Ported from Owarine 90a91d71:web/src/app/games/duel/page.tsx.
import { DuelIsland } from "@/features/games/GamesIsland";

export const metadata = { title: "Duel" };

export default function GamesDuelPage() {
  return <DuelIsland />;
}
