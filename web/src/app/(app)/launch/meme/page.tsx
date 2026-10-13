// `/launch/meme` (S17b; R4-11, D-227): a memecoin on the curve launchpad, three steps and one signature.
import { MemeWizardIsland } from "@/features/launch/islands";
import { LoadingState } from "@/components/states/LoadingState";
import { DataGate } from "@/providers/data/DataGate";

export const metadata = { title: "Launch a memecoin" };

export default function LaunchMemePage() {
  return (
    <DataGate fallback={<LoadingState shape="studio" />}>
      <MemeWizardIsland />
    </DataGate>
  );
}
