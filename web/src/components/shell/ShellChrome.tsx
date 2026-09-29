// Ported from Masayume 68f7a09:web/src/components/shell/ShellChrome.tsx (with Agari 03b30ab's `BootNotice` placement:
// notices render inside the page, under the fixed chrome, never over it). The ux-audit fixes: a skip link, the main
// landmark is focusable for it, the grain is gone on coarse pointers (CSS), the dead custom cursor is removed, and the
// account area and global notices are slots the route group fills (the site group carries no wallet stack, D-050).
import { Suspense, type ReactNode } from "react";
import { LiveMarquee } from "@/features/prices/LiveMarquee";
import { SHELL } from "@/lib/copy";
import AppStrip from "./AppStrip";
import Footer from "./Footer";
import GrainOverlay from "./GrainOverlay";
import Header from "./header/Header";
import { MovedNote } from "./MovedNote";

export interface ShellChromeProps {
  children: ReactNode;
  /** The header's right edge: money + account in the app group, "Open the app" on the site group. */
  account?: ReactNode;
  /** Global notices mounted above every page: the session banner, BootNotice, the wrong-network banner. */
  notices?: ReactNode;
}

export function ShellChrome({ children, account, notices }: ShellChromeProps) {
  return (
    <>
      <a className="skip-link" href="#content">{SHELL.skipLink}</a>
      <Suspense fallback={null}>
        <AppStrip />
      </Suspense>
      <LiveMarquee />
      <Header account={account} />
      <GrainOverlay />
      <main id="content" tabIndex={-1} className="page-shell">
        <Suspense fallback={null}>
          <MovedNote />
        </Suspense>
        {notices}
        {children}
      </main>
      <Footer />
    </>
  );
}
