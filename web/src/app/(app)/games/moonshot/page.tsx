// /games/moonshot — S10b replaces the registered pending page (Masayume 68f7a09:web/src/app/games/moonshot/page.tsx).
import { MoonshotPage } from "@/features/games/moonshot/MoonshotPage";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/games/moonshot").title };

export default function Page() {
  return <MoonshotPage />;
}
