"use client";

import type { ReactNode } from "react";
import { externalClick } from "@/lib/open-external";

/** An external link that opens the in-app browser inside the native shell and a new tab on the web (fix 5); `onClick`
 *  runs first (a sheet closing behind it). */
export function ExternalLink({ href, className, onClick, children }: { href: string; className?: string; onClick?: () => void; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={(event) => { onClick?.(); externalClick(event); }}>
      {children}
    </a>
  );
}
