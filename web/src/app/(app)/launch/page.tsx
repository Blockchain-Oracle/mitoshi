// `/launch` (S17; R4-11, D-227; R6 money S08, D-230): the launchpad board — every public launch from the index with its
// market cap, volume, holders, age and curve, sorted four ways; the team's QA launches behind `?test=1`.
import { BoardLoading, LaunchIsland } from "@/features/launch/islands";
import { DataGate } from "@/providers/data/DataGate";

export const metadata = { title: "Launch", description: "Memecoins on a bonding curve and USD stablecoins on Tempo." };

export default function LaunchPage() {
  return (
    <DataGate fallback={<BoardLoading />}>
      <LaunchIsland />
    </DataGate>
  );
}
