// The route's loading boundary (R6 T18, D-230): this game's own stage outline — the hall never stands in for a play route.
import { StageWait } from "@/features/games/GameWaits";

export default function Loading() {
  return <StageWait />;
}
