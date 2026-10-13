// `/launch` (S17; R4-11, D-227): every launch the registry records, read client-side from the chain.
import { LAUNCH_READING, LaunchIsland } from "@/features/launch/islands";
import { LoadingState } from "@/components/states/LoadingState";
import { DataGate } from "@/providers/data/DataGate";

export const metadata = { title: "Launch", description: "Launch a coin in one confirmation." };

export default function LaunchPage() {
  return (
    <DataGate fallback={<LoadingState shape="page" label={LAUNCH_READING} />}>
      <LaunchIsland />
    </DataGate>
  );
}
