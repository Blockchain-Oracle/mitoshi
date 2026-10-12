// The site route group (D-050): the landing and the pitch (D-226: every other page renders in the app shell). It carries NO
// wallet stack, no query client and no chain runtime — the header offers "Open the app" where the app group shows
// the account. Budget: ≤ 120 KB first-load JS (plan §3.1).
import Link from "next/link";
import type { ReactNode } from "react";
import { ShellChrome } from "@/components/shell/ShellChrome";
import { SHELL } from "@/lib/copy";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <ShellChrome account={<Link href="/markets" className="btn btn-primary">{SHELL.openApp}</Link>}>
      {children}
    </ShellChrome>
  );
}
