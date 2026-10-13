// `/launch/meme` (S17b; R4-11, D-227): a memecoin on the curve launchpad, three steps and one signature.
import { MemeWizardIsland } from "@/features/launch/islands";
import { DataGate } from "@/providers/data/DataGate";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { studio as studioShape } from "@/components/states/shapes/automate";

export const metadata = { title: "Launch a memecoin" };

export default function LaunchMemePage() {
  return (
    <DataGate fallback={<LoadingFrame shape="studio">{studioShape()}</LoadingFrame>}>
      <MemeWizardIsland />
    </DataGate>
  );
}
