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

/** A strategy card (R4-6): the portrait, the name and instinct, the one bold figure, the foot. */
function StrategyBones() {
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
function TabBones({ n }: { n: number }) {
  return (
    <div className="skel-tabs">
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-3 w-16 rounded-md" />)}
    </div>
  );
}

export type LoadingShape = "line" | "row" | "plate" | "chart" | "ticket" | "cards" | "page" | "hero" | "tiles" | "table" | "podium" | "strategy-grid" | "studio" | "agents-board" | "cockpit" | "earn" | "game";

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
  // /strategies' body under its nameplate and pills (R4-6; the head stands from the first paint): the archive's head,
  // its filter tabs, the portrait cards — drawn by the island's placeholder and the screen's reading state alike.
  "strategy-grid": () => (
    <div className="flex flex-col gap-5">
      <div className="skel-section-head">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-44 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <TabBones n={4} />
      <div className="skel-strat-grid">
        <StrategyBones />
        <StrategyBones />
        <StrategyBones />
      </div>
    </div>
  ),
  // The creator studio (R4-6): the four-step rail, the panel (the one-line preview strip on phones, a field, the four
  // approach cards 2-up, the actions) beside the sticky preview aside.
  studio: () => (
    <div className="flex flex-col">
      <div className="skel-steps">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-2.5 w-5 rounded-sm" />
            <Skeleton className="h-3 w-4/5 rounded-md" />
          </div>
        ))}
      </div>
      <div className="skel-studio">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="skel-studio-strip h-12 w-full rounded-lg" />
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
          <div className="skel-studio-actions">
            <Skeleton className="h-12 w-full max-w-88 rounded-full" />
          </div>
        </div>
        <div className="skel-card skel-studio-aside">
          <Skeleton className="h-2.5 w-16 rounded-sm" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-14 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-3 w-1/2 rounded-md" />
            </div>
          </div>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-3 w-full rounded-md" />)}
        </div>
      </div>
    </div>
  ),
  // /agents' body under its title and entry links (R4-6; the head stands from the first paint): the four stat tiles,
  // the order tabs, the first runner rows — drawn by the island's placeholder and the board's reading state alike.
  "agents-board": () => (
    <div className="flex flex-col gap-6">
      <div className="skel-stats">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-md" />)}
      </div>
      <TabBones n={2} />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel-card skel-board-row">
            <Skeleton className="h-6 w-8 rounded-md" />
            <Skeleton className="size-11 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-1/3 rounded-md" />
              <Skeleton className="h-3 w-1/4 rounded-md" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md max-md:hidden" />
          </div>
        ))}
      </div>
    </div>
  ),
  // /agents/[id] (R4-6): the head with its portrait and toolbar, the record beside the next read, the tabs.
  cockpit: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-32 max-w-full rounded-md" />
          <Skeleton className="h-8 w-56 max-w-full rounded-md" />
        </div>
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <div className="skel-hero">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg max-lg:hidden" />
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  ),
  // /earn (R4-7, D-227): the black reserve card, the action card and the first Window rows, in the page's own grid.
  earn: () => (
    <div className="skel-earn">
      <Skeleton className="skel-earn-card rounded-xl" />
      <div className="skel-card skel-earn-action">
        <Skeleton className="h-touch w-full rounded-md" />
        <Skeleton className="h-touch w-full rounded-md" />
        <Skeleton className="h-(--ticket-cta-height) w-full rounded-full" />
      </div>
      <div className="skel-card skel-earn-rows gap-0 py-1">
        {[0, 1, 2].map((i) => <RowBones key={i} />)}
      </div>
    </div>
  ),
  // A house game (R4-5, D-227): the head row, the cadence words, the Window chips, the board, the action block — where
  // each lands, so nothing jumps when the reserve answers.
  game: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-28 rounded-md" />
        <Skeleton className="ml-auto h-9 w-24 rounded-full" />
        <Skeleton className="size-9 rounded-full" />
      </div>
      <div className="flex gap-5">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-10 rounded-md" />)}
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-touch w-24 rounded-full" />)}
      </div>
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-md" />
      <Skeleton className="h-44 w-full rounded-lg" />
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
