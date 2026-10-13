// The site route group (D-050): the landing and the pitch (D-226: every other page renders in the app shell). It carries NO
// wallet stack, no query client and no chain runtime. R4-13a (D-227): the landing draws its own nav and footer
// (Owarine 90a91d71's LandingPage has no site chrome over it), so the group adds nothing; `/pitch` keeps ShellChrome in
// its own layout. Budget: ≤ 35 KB own first-load JS (scripts/perf/route-budgets.ts).
import type { ReactNode } from "react";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return children;
}
