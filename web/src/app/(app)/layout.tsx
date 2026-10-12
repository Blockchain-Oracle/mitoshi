// The app route group (D-050): every trading, portfolio and account surface, in the app's frame (`AppFrame`: the
// providers, the roy-chain/Slush shell and the global notices). Budget: ≤ 250 KB first-load JS (plan §3.1).
import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell/AppFrame";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
