// /games/line-rider — Owarine 90a91d71's arcade, score-only (P4, D-223).
import { ArcadeStage } from "@/features/games/arcade/ArcadeStage";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/games/line-rider").title };

export default function Page() {
  return <ArcadeStage game="line-rider" />;
}
