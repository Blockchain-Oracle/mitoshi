// Registered from S1 (every nav route exists from day one); the stage named in `lib/capabilities.ts` replaces it. In
// the app shell since R4-8 (critic bug 15, D-226 point 3): the island group had no top line.
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/trade-from-x").title };

export default function TradeFromXPage() {
  return <PendingRoute route="/trade-from-x" />;
}
