// The Automate pages' outlines (R4-6, D-227): each body placeholder sits where its content lands — the archive, the
// creator studio, the agents board, an agent's cockpit.
import { Skeleton, StrategyBones, TabBones } from "./bones";

/** /strategies' body under its nameplate and pills: the archive's head, its filter tabs, the portrait cards. */
export const strategyGrid = () => (
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
);

/** The creator studio: the four-step rail, the panel (strip, field, approach cards 2-up, actions) beside the preview. */
export const studio = () => (
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
);

/** /agents' body: the four stat tiles, the order tabs, the first runner rows. */
export const agentsBoard = () => (
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
);

/** /agents/[id]: the head with its portrait and toolbar, the record beside the next read, the tabs. */
export const cockpit = () => (
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
);
