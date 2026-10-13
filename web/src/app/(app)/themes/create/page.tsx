// `/themes/create` (S16; R4-11, D-227): pick stocks, an envelope and a fee, then publish on chain.
import { ThemeStudioIsland } from "@/features/themes/islands";
import { LoadingState } from "@/components/states/LoadingState";
import { DataGate } from "@/providers/data/DataGate";

export const metadata = { title: "Create a theme" };

export default function ThemeCreatePage() {
  return (
    <DataGate fallback={<LoadingState shape="studio" />}>
      <ThemeStudioIsland />
    </DataGate>
  );
}
