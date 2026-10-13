// The app's frame (D-050; S22, D-189): the providers (query cache, chain port, boot clock, motion, toasts, recovery, the
// wallet stack), the roy-chain/Slush shell — rail, top line, stage, dock — with its account and money slots, and the
// global notices (the one live region; a failed boot read is the top line's connection strip since R6 shell S04). The app route group wraps every page in it, and the root 404 does
// too (R4-0, D-227; Owarine 90a91d71 renders its NotFoundScreen inside the shell), so a missing page keeps the rail, top
// line and dock and still answers 404.
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { LiveRegion } from "@/components/states/LiveRegion";
import { HeaderAccount } from "@/components/shell/header/HeaderAccount";
import { SessionBanners } from "@/components/shell/SessionBanners";
import { Splash } from "@/components/shell/Splash";
import { AlertsWatcher } from "@/features/alerts/AlertsWatcher";
import { LifecycleWatcher } from "@/features/notifications/LifecycleWatcher";
import { AppProviders } from "@/providers";

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AppShell
        railFoot={<HeaderAccount placement="rail" />}
        account={<HeaderAccount placement="top" />}
        notices={<><span hidden data-font-stage="app" /><SessionBanners /><LiveRegion /><LifecycleWatcher /><AlertsWatcher /></>}
      >
        {children}
      </AppShell>
      <Splash />
    </AppProviders>
  );
}
