/**
 * A source label as a quiet line (Ported from Owarine 90a91d71:web/src/features/markets/price-source/SourceLine.tsx,
 * R4-3 D-227): the source by its plain name, the feed's own page in a new tab where one is pinned, plain text otherwise.
 * The caller gives it the container's own type (`pair-meta` in the hero head).
 */
import { cn } from "@/lib/utils";
import "./source-line.css";

export interface SourceLabel {
  text: string;
  href: string | null;
}

export function SourceLine({ label, className }: { label: SourceLabel | null; className?: string }) {
  if (!label) return null;
  return (
    <span className={cn("src-line", className)}>
      {label.href ? (
        <a href={label.href} target="_blank" rel="noreferrer" className="src-line-link">
          {label.text}
          <span aria-hidden className="src-line-arrow">↗</span>
        </a>
      ) : (
        label.text
      )}
    </span>
  );
}
