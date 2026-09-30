// /parlay — S10a replaces the registered pending page with the live surface (Masayume 68f7a09:web/src/app/parlay/page.tsx).
// A static shell; the reserve, the Windows, the slip and your tickets stream in client-side after first paint (D-071).
import { ParlayPage } from "@/features/parlay/ParlayPage";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/parlay").title };

export default function Page() {
  return <ParlayPage />;
}
