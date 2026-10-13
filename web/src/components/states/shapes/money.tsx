// The money pages' outlines (R4-4, R4-7, D-227; R6 T18, D-230): /portfolio's plate and pockets, /earn's reserve card
// beside its action card — with the action card's chip row — in the page's own grid.
import { RowBones, Skeleton } from "./bones";

/** /portfolio: the full-width money card with its pill pair, the two pockets, the first bet rows. */
export const portfolio = () => (
  <div className="flex flex-col gap-6">
    <div className="skel-money">
      <div className="skel-money-line w-24" />
      <div className="skel-money-figure" />
      <div className="skel-money-line w-40" />
      <div className="skel-money-pills">
        <div className="skel-money-pill" />
        <div className="skel-money-pill" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
    <div className="skel-card gap-0 py-1">
      {[0, 1, 2].map((i) => <RowBones key={i} />)}
    </div>
  </div>
);

/** /earn: the reserve card, the action card (its field, the chip row, the CTA), then the first Window rows. */
export const earn = () => (
  <div className="skel-earn">
    <Skeleton className="skel-earn-card rounded-xl" bone="card" />
    <div className="skel-card skel-earn-action" data-bone="action">
      <div className="flex gap-2">
        {[0, 1].map((i) => <Skeleton key={i} className="h-9 flex-1 rounded-full" />)}
      </div>
      <Skeleton className="h-touch w-full rounded-md" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 flex-1 rounded-full" />)}
      </div>
      <Skeleton className="h-(--ticket-cta-height) w-full rounded-full" />
      <Skeleton className="h-3 w-2/3 self-center rounded-md" />
    </div>
    <div className="skel-card skel-earn-rows gap-0 py-1">
      {[0, 1, 2].map((i) => <RowBones key={i} />)}
    </div>
  </div>
);
