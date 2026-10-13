// `/themes/create` (S16; R4-11, D-227): pick stocks, an envelope and a fee, then publish on chain.
import { ThemeStudio } from "@/features/themes/ThemeStudio";

export const metadata = { title: "Create a theme" };

export default function ThemeCreatePage() {
  return <ThemeStudio />;
}
