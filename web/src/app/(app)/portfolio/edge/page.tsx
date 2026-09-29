// Registered from S1 (every nav route exists from day one); the stage named in `lib/capabilities.ts` replaces it.
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/portfolio/edge").title };

export default function PortfolioEdgePage() {
  return <PendingRoute route="/portfolio/edge" />;
}
