// Registered from S1 (every nav route exists from day one); the stage named in `lib/capabilities.ts` replaces it.
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { FirstUseHint } from "@/features/onboarding/FirstUseHint";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/portfolio").title };

export default function PortfolioPage() {
  return <PendingRoute route="/portfolio" hint={<FirstUseHint id="money" className="mt-4" />} />;
}
