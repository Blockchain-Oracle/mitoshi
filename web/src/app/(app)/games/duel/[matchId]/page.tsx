// /games/duel/<matchId> — one duel as the arena says it (R4-9, D-227; Owarine 90a91d71 DuelPublicResult's role): both
// P&Ls, each card, and the cranks anyone may send.
import { DuelMatchIsland } from "@/features/games/GamesIsland";

export const metadata = { title: "A duel" };

export default async function GamesDuelMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <DuelMatchIsland matchId={matchId} />;
}
