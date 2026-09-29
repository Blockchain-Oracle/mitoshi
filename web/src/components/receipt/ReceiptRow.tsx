// Ported from Masayume 68f7a09:web/src/components/receipt/ReceiptRow.tsx
import type { ReactNode } from "react";
import { ProofLink } from "./ProofLink";

interface ReceiptRowProps {
  label: string;
  /** Omit for a plain value; a string links it; `null` marks the proof source as degraded. */
  href?: string | null;
  degradedLabel?: string;
  children: ReactNode;
}

/** A dotted-leader ledger row: label … value. */
export function ReceiptRow({ label, href, degradedLabel, children }: ReceiptRowProps) {
  return (
    <div className="flex items-baseline gap-2 type-data">
      <span className="shrink-0 text-cream-ink/80">{label}</span>
      <span className="min-w-0 flex-1 -translate-y-[0.3em] border-b border-dotted border-cream-hairline" aria-hidden="true" />
      {href === undefined ? (
        <span className="numbers text-right">{children}</span>
      ) : (
        <ProofLink href={href} degradedLabel={degradedLabel}>
          {children}
        </ProofLink>
      )}
    </div>
  );
}
