"use client";
// Ported from Masayume 68f7a09:web/src/components/chrome/Pager.tsx — Prev · "1–8 of 23" · Next under a paged list;
// nothing while the list fits on one page.
import type { PagerState } from "@/lib/use-pager";
import { cn } from "@/lib/utils";
import { PAGER } from "./copy";

export function Pager<T>({ pager, className }: { pager: PagerState<T>; className?: string }) {
  if (pager.total <= pager.pageSize) return null;
  return (
    <nav className={cn("pager", className)} aria-label={PAGER.aria}>
      <button type="button" className="pager-button min-h-touch" onClick={pager.prev} disabled={!pager.canPrev}>{PAGER.prev}</button>
      <span className="pager-range numbers" aria-live="polite">{PAGER.range(pager.from, pager.to, pager.total)}</span>
      <button type="button" className="pager-button min-h-touch" onClick={pager.next} disabled={!pager.canNext}>{PAGER.next}</button>
    </nav>
  );
}
