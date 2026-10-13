// `/themes` (S16; R4-11, D-227): every published theme, read client-side from the registry.
import { THEMES_READING, ThemesIsland } from "@/features/themes/islands";
import { LoadingState } from "@/components/states/LoadingState";
import { DataGate } from "@/providers/data/DataGate";

export const metadata = { title: "Themes", description: "Stock baskets an agent rebalances." };

export default function ThemesPage() {
  return (
    <DataGate fallback={<LoadingState shape="cards" label={THEMES_READING} />}>
      <ThemesIsland />
    </DataGate>
  );
}
