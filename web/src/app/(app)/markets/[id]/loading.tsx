// Per-segment loading boundary (D-050): partial prefetch fetches the shell down to here, and a slow navigation is
// never silent (ux-audit §8: zero loading.tsx before). R4-13a (D-227): the page redirects to /markets, so it waits in
// /markets' own placeholder — the one that screen replaces in place.
import { MarketsLoading } from "@/features/markets/MarketsPage";

export default function Loading() {
  return <MarketsLoading />;
}
