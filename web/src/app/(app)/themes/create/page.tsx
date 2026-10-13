// `/themes/create` (S16; R4-11, D-227): pick stocks, an envelope and a fee, then publish on chain.
import { ThemeStudioIsland } from "@/features/themes/islands";
import { DataGate } from "@/providers/data/DataGate";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { studio as studioShape } from "@/components/states/shapes/automate";

export const metadata = { title: "Create a theme" };

export default function ThemeCreatePage() {
  return (
    <DataGate fallback={<LoadingFrame shape="studio">{studioShape()}</LoadingFrame>}>
      <ThemeStudioIsland />
    </DataGate>
  );
}
