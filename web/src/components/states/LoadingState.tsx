// Ported from Masayume 68f7a09:web/src/components/states/LoadingState.tsx; Owarine 90a91d71's shapes (line · row ·
// plate · chart · ticket) plus the page-level ones a route's loading boundary draws (D-226): a placeholder shaped like
// the page it stands in for, shimmering (`styles/states.css`, 21st.dev 19999 revamped), never one grey bar.
import type { ReactNode } from "react";

// Bars are drawn here rather than through `ui/skeleton` + `cn`: loading boundaries are in every route's first load, and
// tailwind-merge is not needed when each bar states its own radius (§3.1).
function Skeleton({ className }: { className: string }) {
  return <div className={`skel ${className}`} />;
}

/** A Window card's outline: the head row, the question, the price, the spark, the two sides. */
function CardBones() {
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
function TileBones() {
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

function RowBones() {
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
function HeadBones() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-48 rounded-md" />
      <Skeleton className="h-4 w-2/3 max-w-md rounded-md" />
    </div>
  );
}

export type LoadingShape = "line" | "row" | "plate" | "chart" | "ticket" | "cards" | "page" | "hero" | "tiles" | "table" | "podium";

const SHAPES: Record<LoadingShape, () => ReactNode> = {
  line: () => <Skeleton className="h-4 w-2/3 rounded-md" />,
  row: () => <RowBones />,
  plate: () => <Skeleton className="h-24 w-full rounded-lg" />,
  // /markets' lane while it loads: the tabs, the ticker chips and the first Window cards.
  cards: () => (
    <>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-touch w-24 rounded-md" />)}
      </div>
      <div className="skel-grid">
        <CardBones />
        <CardBones />
        <CardBones />
      </div>
    </>
  ),
  chart: () => <Skeleton className="h-48 w-full rounded-lg" />,
  ticket: () => (
    <>
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-(--ticket-cta-height) w-full rounded-md" />
    </>
  ),
  // Any page: its head and a grid of cards.
  page: () => (
    <div className="flex flex-col gap-8">
      <HeadBones />
      <div className="skel-grid">
        <TileBones />
        <TileBones />
        <TileBones />
      </div>
    </div>
  ),
  // The markets hero: the question and chart beside the ticket (the ticket column from `lg`).
  hero: () => (
    <div className="skel-hero">
      <div className="skel-card">
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="ml-auto h-8 w-16 rounded-md" />
        </div>
        <Skeleton className="h-8 w-3/4 rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </div>
      </div>
      <div className="skel-card max-lg:hidden">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-12 w-1/2 self-center rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-(--ticket-cta-height) w-full rounded-md" />
      </div>
    </div>
  ),
  tiles: () => (
    <div className="skel-grid">
      <TileBones />
      <TileBones />
      <TileBones />
      <TileBones />
      <TileBones />
      <TileBones />
    </div>
  ),
  table: () => (
    <div className="skel-card gap-0 py-1">
      {[0, 1, 2, 3, 4].map((i) => <RowBones key={i} />)}
    </div>
  ),
  // The leaderboard: the head, the filters, three on the podium, the first rows.
  podium: () => (
    <div className="flex flex-col gap-8">
      <HeadBones />
      <div className="flex gap-2">
        <Skeleton className="h-touch w-28 rounded-md" />
        <Skeleton className="h-touch w-56 rounded-md" />
      </div>
      <div className="skel-podium">
        {["h-14", "h-20", "h-12"].map((h) => (
          <div key={h} className="flex flex-col items-center gap-3">
            <Skeleton className="size-14 rounded-full" />
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className={`${h} w-full rounded-t-md`} />
          </div>
        ))}
      </div>
      <div className="skel-card gap-0 py-1">
        {[0, 1, 2, 3].map((i) => <RowBones key={i} />)}
      </div>
    </div>
  ),
};

interface LoadingStateProps {
  shape?: LoadingShape;
  label?: string;
  className?: string;
}

/** Skeleton only where nothing was ever known — never an invented number. */
export function LoadingState({ shape = "line", label = "Loading", className }: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className ? `flex flex-col gap-3 ${className}` : "flex flex-col gap-3"}>
      {SHAPES[shape]()}
    </div>
  );
}
