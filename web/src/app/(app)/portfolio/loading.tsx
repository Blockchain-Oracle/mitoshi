// The route's loading boundary (R4-13a, D-227; plan §3.2 per-segment loading): the island's own placeholder, so a
// navigation shows one shape that the screen replaces in place, never the group's generic page first.
import { PortfolioLoading } from "@/features/markets/portfolio/PortfolioPage";

export default function Loading() {
  return <PortfolioLoading />;
}
