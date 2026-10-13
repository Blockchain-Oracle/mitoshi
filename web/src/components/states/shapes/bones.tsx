// The skeleton's building blocks (D-226; R6 T18, D-230). Bars are drawn here rather than through `ui/skeleton` + `cn`:
// loading boundaries are in every route's first load, and tailwind-merge is not needed when each bar states its own
// radius (§3.1). One block shimmer: `.skel` (styles/states.css, From 21st.dev 19999 animbits/skeleton-loader).
import type { ReactNode } from "react";

export function Skeleton({ className, bone }: { className: string; bone?: string }) {
  return <div className={`skel ${className}`} data-bone={bone} />;
}

/**
 * A text bone: invisible words in the page's own type class, drawn as a bar — so the bone is exactly the box the text
 * will take (its line height, its font) and nothing jumps when the words land. The words are never shown.
 */
export function T({ children, className }: { children: ReactNode; className?: string }) {
  return <span aria-hidden className={className ? `skel skel-text ${className}` : "skel skel-text"}>{children}</span>;
}

/** A Window card's outline: the head row, the question, the price, the spark, the two sides. */
export function CardBones() {
  return (
    <div className="skel-card">
      <div className="flex items-center gap-2">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="ml-auto h-3 w-10 rounded-md" />
      </div>
      <Skeleton className="h-4 w-4/5 rounded-md" />
      <Skeleton className="h-6 w-24 rounded-md" />
      <Skeleton className="h-20 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-10 rounded-md" />
      </div>
    </div>
  );
}

/** A tile: a disc, a name, a line. */
export function TileBones() {
  return (
    <div className="skel-card">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/2 rounded-md" />
          <Skeleton className="h-3 w-3/4 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-md" />
    </div>
  );
}

export function RowBones() {
  return (
    <div className="skel-row">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2 rounded-md" />
        <Skeleton className="h-3 w-1/3 rounded-md" />
      </div>
      <Skeleton className="h-4 w-14 rounded-md" />
    </div>
  );
}

/** A page head: the title and one line. */
export function HeadBones() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-48 rounded-md" />
      <Skeleton className="h-4 w-2/3 max-w-md rounded-md" />
    </div>
  );
}

/** A strategy card (R4-6): the portrait, the name and instinct, the one bold figure, the foot. */
export function StrategyBones() {
  return (
    <div className="skel-card skel-strat-card">
      <div className="flex items-start gap-3">
        <Skeleton className="size-14 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-1/2 rounded-md" />
          <Skeleton className="h-3 w-2/3 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-8 w-28 rounded-md" />
      <Skeleton className="h-3 w-full rounded-md" />
    </div>
  );
}

/** A row of underline tabs (the archive's filters, the board's order). */
export function TabBones({ n }: { n: number }) {
  return (
    <div className="skel-tabs">
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-3 w-16 rounded-md" />)}
    </div>
  );
}

/** `n` copies of a bone row, keyed by index. */
export function times(n: number, render: (i: number) => ReactNode): ReactNode[] {
  return Array.from({ length: n }, (_, i) => render(i));
}

/** The numbered section head (`SectionHeader`'s own markup): `01 · Title`, a hairline, an optional one-line desc. */
export function SectionHeadBones({ desc = false }: { desc?: boolean }) {
  return (
    <header className="border-b border-hairline pb-2">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <T className="type-label-micro">01</T>
          <T className="type-title">Section title</T>
        </div>
      </div>
      {desc ? <p className="mt-1 type-caption"><T>One line under the section title.</T></p> : null}
    </header>
  );
}
