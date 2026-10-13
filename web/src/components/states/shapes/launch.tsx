// The launch pages' outlines (R6 money, S02 + S08 + T07; D-230), each drawn from its page's settled boxes: the board
// (its head stats, the controls, six rows — cards on a phone), a token (the head and its graduation bar, the chart,
// the facts, the tab rows), a token's feed (tape rows) and the meme wizard's curve templates (four card bones).
import { RowBones, Skeleton } from "./bones";

/** /launch: the stat strip, the tabs and the test switch, then six board rows. */
export const launchBoard = () => (
  <div className="lp-board-page">
    <div className="lp-stats" data-bone="stats">
      {[0, 1, 2].map((i) => (
        <div key={i} className="lp-stat">
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
      ))}
    </div>
    <div className="flex items-center justify-between gap-4">
      <div className="flex gap-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-18 rounded-md" />)}</div>
      <Skeleton className="h-6 w-32 rounded-full" />
    </div>
    <div className="lp-board" data-bone="rows">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="lp-board-bone">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-32 rounded-md" />
            <Skeleton className="h-2 w-full max-w-60 rounded-full" />
          </div>
          <Skeleton className="h-4 w-16 rounded-md" />
        </div>
      ))}
    </div>
  </div>
);

/** /launch/<token>: the head with its graduation bar, the chart with its chips, the facts, then the tab rows. */
export const launchToken = () => (
  <div className="lp-token-grid">
    <div className="lp-token-main">
      <div className="lp-token-head" data-bone="head">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-2"><Skeleton className="h-4 w-32 rounded-md" /><Skeleton className="h-3 w-20 rounded-md" /></div>
        <Skeleton className="h-6 w-24 rounded-md" />
        <div className="lp-token-grad"><Skeleton className="h-2 w-full rounded-full" /></div>
      </div>
      <Skeleton className="lp-chart-bone w-full rounded-lg" />
      <div className="lp-facts">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-md" />)}</div>
      <div className="flex flex-col">{[0, 1, 2, 3, 4, 5].map((i) => <RowBones key={i} />)}</div>
    </div>
  </div>
);

/** A token's trades or holders while the feed reads. */
export const launchFeed = () => (
  <div className="flex flex-col">
    {[0, 1, 2, 3, 4, 5].map((i) => <RowBones key={i} />)}
  </div>
);

/** The meme wizard's curve templates while they read: four card bones. */
export const templateCards = () => (
  <div className="lp-templates">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="lp-template">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-3 w-40 rounded-md" />
        <Skeleton className="h-7 w-full rounded-md" />
      </div>
    ))}
  </div>
);
