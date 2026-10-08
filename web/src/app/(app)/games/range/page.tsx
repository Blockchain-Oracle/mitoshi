// /games/range — S10b replaces the registered pending page (Masayume 68f7a09:web/src/app/games/range/page.tsx).
import { RangePage } from "@/features/range/RangePage";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/games/range").title };

export default function Page() {
  return <RangePage />;
}
