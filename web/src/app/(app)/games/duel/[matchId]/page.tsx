// Registered from S1 (every nav route exists from day one); the stage named in `lib/capabilities.ts` replaces it.
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { pendingFor } from "@/lib/capabilities";

export const metadata = { title: pendingFor("/games/duel/[matchId]").title };

export default function GamesDuelMatchidPage() {
  return <PendingRoute route="/games/duel/[matchId]" />;
}
