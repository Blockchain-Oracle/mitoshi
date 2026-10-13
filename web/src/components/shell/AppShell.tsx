// Ported from Baku (roy-chain) ede3ed38:apps/web/src/components/shell/app-shell.tsx — the app shell (S22, D-189): a
// floating rail on the left (Slush), the top line, and ONE bordered stage that holds the page; on phones the rail
// hides, the top line carries the mark and the dock sits at the bottom. Mitoshi's colours; the account, money and
// notices are slots the route group fills (the site group carries no wallet stack, D-050). The frame is synchronous;
// everything that reads the path or the wallet is a client island inside it. R4-8 (D-227): `EnvironmentMode` paints
// which world you are in (demo / testnet) on <html>, Owarine's environment.
import { Suspense, type ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { EnvironmentMode } from "./EnvironmentMode";
import { EverythingHost } from "./EverythingHost";
import { FeedbackPreload } from "./FeedbackPreload";
import { MobileDock } from "./MobileDock";
import { MovedNote } from "./MovedNote";
import { Rail } from "./Rail";
import { TopLine } from "./TopLine";

export interface AppShellProps {
  children: ReactNode;
  /** The rail's foot: money and account (Slush's account + balance pill). */
  railFoot?: ReactNode;
  /** The top line's right edge: money where the rail is compact or hidden, the account on phones. */
  account?: ReactNode;
  /** Global notices under the top line: the session banner, BootNotice, the wrong-network banner, the live region. */
  notices?: ReactNode;
}

export function AppShell({ children, railFoot, account, notices }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">{SHELL.skipLink}</a>
      <Rail foot={railFoot} />
      <div className="app-column">
        <TopLine account={account} />
        <div className="app-notices">
          <Suspense fallback={null}>
            <MovedNote />
          </Suspense>
          {notices}
        </div>
        {/* The stage is the main landmark and the skip link's target. */}
        <main id="content" tabIndex={-1} className="app-stage">
          {children}
        </main>
      </div>
      <MobileDock />
      <EverythingHost />
      <EnvironmentMode />
      <FeedbackPreload />
    </div>
  );
}
