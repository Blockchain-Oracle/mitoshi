// Ported from Masayume 68f7a09:web/src/components/receipt/ProofLink.tsx
import type { ReactNode } from "react";
import { PROOF_CAPTION, PROOF_DEGRADED } from "@/lib/copy";
import { cn } from "@/lib/utils";

interface ProofLinkProps {
  /** `null` = the proof source is unreachable; the caption never appears without a working link. */
  href: string | null;
  degradedLabel?: string;
  className?: string;
  children: ReactNode;
}

export function ProofLink({ href, degradedLabel = PROOF_DEGRADED, className, children }: ProofLinkProps) {
  if (!href) {
    return (
      <span className={cn("inline-flex flex-col items-end", className)}>
        <span className="numbers">{children}</span>
        <span className="type-label-micro normal-case text-warning">{degradedLabel}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-col items-end", className)}>
      <a href={href} target="_blank" rel="noreferrer" className="numbers underline decoration-dotted underline-offset-4">
        {children}
      </a>
      <span className="type-label-micro normal-case opacity-70">{PROOF_CAPTION}</span>
    </span>
  );
}
