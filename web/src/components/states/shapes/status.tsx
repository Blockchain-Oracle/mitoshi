// /status and /status/halts' outlines (R6 T18, D-230): the settled board's own frames (BoardBanner's classes, the
// accordion rows) — the verdict card with its block figure, tally pills and dot strip, then the rows — with text bones
// in the board's own type, sized by each board's usual words (invisible; never shown). Before R6 both waited in the markets hero's shape.
import { Skeleton, T } from "./bones";

function Banner({ dots, verdict, sub }: { dots: number; verdict: string; sub: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-surface-1 p-6 ring-1 ring-hairline sm:p-8" data-bone="verdict">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="flex items-center gap-2"><Skeleton className="size-5 rounded-full" /><T className="type-label-micro">Mitoshi status</T></span>
          <div className="type-display"><T>{verdict}</T></div>
          <p className="type-body"><T>{sub}</T></p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <T className="type-label-micro">Tempo block</T>
          <T className="type-title leading-none">00,000,000</T>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-26 rounded-full" />
        <Skeleton className="h-9 w-23 rounded-full" />
      </div>
      <div className="mt-5 flex h-8 items-end gap-0.5" aria-hidden>
        {Array.from({ length: dots }, (_, i) => <Skeleton key={i} className="h-4 min-w-0 flex-1 rounded-full" />)}
      </div>
    </section>
  );
}

function Rows({ n, cols = false }: { n: number; cols?: boolean }) {
  return (
    <div className={cols ? "grid items-start gap-3 lg:grid-cols-2" : "flex flex-col gap-3"} data-bone="rows">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex min-h-17.5 items-center gap-3 rounded-xl bg-surface-1 px-4 ring-1 ring-hairline">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <T className="type-body-strong">Prices</T>
            <T className="type-caption">All fresh</T>
          </div>
          <Skeleton className="size-4.5 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export const status = () => (
  <div className="flex flex-col gap-8">
    <Banner dots={19} verdict="All systems live" sub="Slowest: Prices · two blocks behind the chain" />
    <section className="flex flex-col gap-3">
      <T className="self-start type-title">Every check · 19</T>
      <Rows n={6} cols />
    </section>
  </div>
);

export const halts = () => (
  <div className="flex flex-col gap-8">
    <Banner dots={13} verdict="No halts" sub="Every watched price, the last 30 days." />
    <Rows n={6} />
  </div>
);
