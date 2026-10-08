// The island routes' chrome (Masayume 68f7a09 ShellChrome's island branch): routes that paint their own top edge —
// `/trade-from-x` — get no top line, stage border or footer. S22 (D-189): the rail on wide screens and the dock on
// phones instead of the pill nav, so every destination stays one tap away; Everything opens from either.
import type { ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { EverythingHost } from "./EverythingHost";
import { FeedbackPreload } from "./FeedbackPreload";
import { MobileDock } from "./MobileDock";
import { Rail } from "./Rail";

export function IslandChrome({ children, notices }: { children: ReactNode; notices?: ReactNode }) {
  return (
    <div className="app-shell app-shell--island">
      <a className="skip-link" href="#content">{SHELL.skipLink}</a>
      <Rail />
      <main id="content" tabIndex={-1} className="page-island">
        {notices}
        {children}
      </main>
      <MobileDock />
      <EverythingHost />
      <FeedbackPreload />
    </div>
  );
}
