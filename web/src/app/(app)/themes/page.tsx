// `/themes` (S16; R4-11, D-227): every published theme, read client-side from the registry.
import { ThemesScreen } from "@/features/themes/ThemesScreen";

export const metadata = { title: "Themes", description: "Stock baskets an agent rebalances." };

export default function ThemesPage() {
  return <ThemesScreen />;
}
