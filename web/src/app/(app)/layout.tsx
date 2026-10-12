// The app route group (D-050): every trading, portfolio and account surface. It mounts the providers (query cache,
// chain port, boot clock, motion, toasts, recovery; the wallet stack joins in 1b wallet) and the global notices
// (BootNotice, the one live region). S22 (D-189): the roy-chain/Slush shell — rail, top line, stage, dock.
// Budget: ≤ 250 KB first-load JS (plan §3.1).
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LiveRegion } from "@/components/states/LiveRegion";
import { HeaderAccount } from "@/components/shell/header/HeaderAccount";
import { SessionBanners } from "@/components/shell/SessionBanners";
import { Splash } from "@/components/shell/Splash";
import { AlertsWatcher } from "@/features/alerts/AlertsWatcher";
import { LifecycleWatcher } from "@/features/notifications/LifecycleWatcher";
import { AppProviders, BootNotice } from "@/providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AppShell
        railFoot={<HeaderAccount placement="rail" />}
        account={<HeaderAccount placement="top" />}
        notices={<><span hidden data-font-stage="app" /><SessionBanners /><BootNotice /><LiveRegion /><LifecycleWatcher /><AlertsWatcher /></>}
      >
        {children}
      </AppShell>
      <Splash />
    </AppProviders>
  );
}
