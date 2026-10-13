// Ported from Owarine 90a91d71:web/src/components/chrome/SectionHeader.tsx (R4-2, D-227) — the numbered section rhythm:
// `index · title` in the micro label and the title face, an optional eyebrow, an aside on the same line, a hairline
// under it and an optional one-line description. The Yosuku `SectionHead` stays where a page already wears it.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  /** "01", "02" … */
  index: string;
  title: string;
  eyebrow?: string;
  desc?: string;
  aside?: ReactNode;
  /** The heading's id, for a section's `aria-labelledby`. */
  id?: string;
  className?: string;
}

export function SectionHeader({ index, title, eyebrow, desc, aside, id, className }: SectionHeaderProps) {
  return (
    <header className={cn("border-b border-hairline pb-2", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="type-label-micro text-ink-muted">{index}</span>
          <span className="text-ink-muted" aria-hidden="true">
            ·
          </span>
          <h2 id={id} className="truncate type-title text-ink">{title}</h2>
          {eyebrow ? <span className="type-label-micro text-ink-secondary">{eyebrow}</span> : null}
        </div>
        {aside}
      </div>
      {desc ? <p className="mt-1 type-caption text-ink-secondary">{desc}</p> : null}
    </header>
  );
}
