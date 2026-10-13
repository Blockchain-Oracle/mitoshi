// The pitch's frame (R4-13a, D-227): the public site's chrome the site group used to put around every page. The landing
// now draws its own (Owarine 90a91d71's LandingNav and footer), so only `/pitch` keeps ShellChrome.
import Link from "next/link";
import type { ReactNode } from "react";
import { ShellChrome } from "@/components/shell/ShellChrome";
import { SHELL } from "@/lib/copy";

export default function PitchLayout({ children }: { children: ReactNode }) {
  return (
    <ShellChrome account={<Link href="/markets" className="btn btn-primary">{SHELL.openApp}</Link>}>
      {children}
    </ShellChrome>
  );
}
