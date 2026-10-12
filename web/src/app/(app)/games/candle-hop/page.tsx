// /games/candle-hop — Owarine 90a91d71's arcade, score-only (P4, D-223).
import { ArcadeStage } from "@/features/games/arcade/ArcadeStage";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/games/candle-hop").title };

export default function Page() {
  return <ArcadeStage game="candle-hop" />;
}
