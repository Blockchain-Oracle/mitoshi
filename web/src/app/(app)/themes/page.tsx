// `/themes` (S16; R4-11, D-227): every published theme, read client-side from the registry.
import { ThemesScreen } from "@/features/themes/ThemesScreen";
import { LoadingState } from "@/components/states/LoadingState";
import { DataGate } from "@/providers/data/DataGate";

export const metadata = { title: "Themes", description: "Stock baskets an agent rebalances." };

export default function ThemesPage() {
  return (
    <DataGate fallback={<LoadingState shape="cards" label="Reading the themes" />}>
      <ThemesScreen />
    </DataGate>
  );
}
