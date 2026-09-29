"use client";

import type { ReactNode } from "react";
import { externalClick } from "@/lib/open-external";

/** An external link that opens the in-app browser inside the native shell and a new tab on the web (fix 5). */
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={externalClick}>
      {children}
    </a>
  );
}
