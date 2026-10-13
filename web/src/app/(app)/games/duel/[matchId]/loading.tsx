// Per-segment loading boundary (D-050): partial prefetch fetches the shell down to here, and a slow navigation is
// never silent (ux-audit §8: zero loading.tsx before). R6 (T18, D-230): the match waits as its stage.
import { StageWait } from "@/features/games/GameWaits";

export default function Loading() {
  return <StageWait />;
}
