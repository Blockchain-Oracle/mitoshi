// `/launch/stablecoin` (S17a; R4-11, D-227): a USD stablecoin, its DEX pair and fee pool in one batch.
import { StablecoinWizardIsland } from "@/features/launch/islands";
import { DataGate } from "@/providers/data/DataGate";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { studio as studioShape } from "@/components/states/shapes/automate";

export const metadata = { title: "Launch a stablecoin" };

export default function LaunchStablecoinPage() {
  return (
    <DataGate fallback={<LoadingFrame shape="studio">{studioShape()}</LoadingFrame>}>
      <StablecoinWizardIsland />
    </DataGate>
  );
}
