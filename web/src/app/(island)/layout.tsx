// Island routes (the reference's `/trade-from-x`): the app providers, but no ticker, header or footer — the page paints
// its own chrome — and the pill nav so every destination stays one tap away.
import type { ReactNode } from "react";
import { IslandChrome } from "@/components/shell/IslandChrome";
import { LiveRegion } from "@/components/states";
import { SessionBanners } from "@/components/shell/SessionBanners";
import { AppProviders, BootNotice } from "@/providers";

export default function IslandLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <IslandChrome notices={<><SessionBanners /><BootNotice /><LiveRegion /></>}>{children}</IslandChrome>
    </AppProviders>
  );
}
