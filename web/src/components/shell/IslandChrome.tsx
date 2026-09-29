"use client";
// The island routes' chrome (Masayume 68f7a09 ShellChrome's island branch): routes that paint their own top edge —
// `/trade-from-x` — get no ticker, header or footer, only the pill nav; now its own route group instead of a
// pathname check (a pathname read outside Suspense blocks the static shell under cacheComponents).
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { MobileBottomNav } from "./header/MobileBottomNav";

function PillNav() {
  return <MobileBottomNav pathname={usePathname()} />;
}

export function IslandChrome({ children, notices }: { children: ReactNode; notices?: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#content">{SHELL.skipLink}</a>
      <main id="content" tabIndex={-1} className="page-island">
        {notices}
        {children}
      </main>
      <Suspense fallback={<MobileBottomNav pathname={null} />}>
        <PillNav />
      </Suspense>
    </>
  );
}
