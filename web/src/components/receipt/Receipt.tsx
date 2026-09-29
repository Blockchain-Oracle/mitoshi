// Ported from Masayume 68f7a09:web/src/components/receipt/Receipt.tsx
import type { ReactNode } from "react";
import { UtcTime } from "@/components/data/UtcTime";
import { RECEIPT_FOOTER, RECEIPT_TITLE } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { ReceiptStub } from "./ReceiptStub";

interface ReceiptProps {
  title?: string;
  /** The monument figure — a <Money> in most cases. */
  figure: ReactNode;
  figureLabel: string;
  settledAtMs: number;
  /** Verdict stamp slot (Story 1.9). */
  stamp?: ReactNode;
  footer?: string;
  className?: string;
  /** Ledger rows (<ReceiptRow>). */
  children?: ReactNode;
}

/** The cream stub: the app's only inverted surface and its only shadow — a physical object you could tear off. */
export function Receipt({
  title = RECEIPT_TITLE,
  figure,
  figureLabel,
  settledAtMs,
  stamp,
  footer = RECEIPT_FOOTER,
  className,
  children,
}: ReceiptProps) {
  return (
    <article
      className={cn(
        "relative w-full max-w-(--content-reading) overflow-hidden rounded-(--receipt-radius) bg-cream text-cream-ink shadow-(--receipt-shadow)",
        className,
      )}
    >
      <div className="h-1.5 bg-accent" aria-hidden="true" />
      <div className="flex flex-col gap-4 p-5">
        <header className="flex items-start justify-between gap-3">
          <span className="type-label-micro text-cream-ink/70">{title}</span>
          {stamp && <div className="stamp-press">{stamp}</div>}
        </header>
        <div className="flex flex-col gap-1">
          <span className="type-label-micro text-cream-ink/70">{figureLabel}</span>
          <div className="type-data-hero">{figure}</div>
          <UtcTime ms={settledAtMs} withDate className="type-data text-cream-ink/80" />
        </div>
        {children && <div className="flex flex-col gap-2">{children}</div>}
      </div>
      <ReceiptStub />
      <footer className="px-5 pt-3 pb-4 type-label-micro normal-case text-cream-ink/70">{footer}</footer>
    </article>
  );
}
