// /reserves (R4-12, D-227; S14 14w): every bridged stock's backing, read from the chains in the browser.
import { ReservesPage } from "@/features/reserves/ReservesPage";
import { RESERVES } from "@/features/reserves/copy";

export const metadata = { title: RESERVES.title };

export default function Page() {
  return <ReservesPage />;
}
