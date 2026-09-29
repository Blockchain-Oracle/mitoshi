// The app route group (D-050): every trading, portfolio and account surface. It mounts the providers (query cache,
// chain port, boot clock, motion, toasts, recovery; the wallet stack joins in 1b wallet) and the global notices
// (BootNotice, the one live region). Budget: ≤ 250 KB first-load JS (plan §3.1).
import type { ReactNode } from "react";
import { ShellChrome } from "@/components/shell/ShellChrome";
import { LiveRegion } from "@/components/states";
import { HeaderAccount } from "@/components/shell/header/HeaderAccount";
import { SessionBanners } from "@/components/shell/SessionBanners";
import { AppProviders, BootNotice } from "@/providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <ShellChrome account={<HeaderAccount />} notices={<><SessionBanners /><BootNotice /><LiveRegion /></>}>{children}</ShellChrome>
    </AppProviders>
  );
}
