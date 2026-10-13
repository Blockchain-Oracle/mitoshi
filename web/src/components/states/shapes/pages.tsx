// Generic shapes (Owarine 90a91d71's line · row · plate · chart · ticket, and the page-level fallbacks, D-226). A page
// with an outline of its own draws that instead (shapes/<feature>.tsx); these are for a box inside a page.
import { CardBones, HeadBones, RowBones, Skeleton, TileBones } from "./bones";

export const line = () => <Skeleton className="h-4 w-2/3 rounded-md" />;
export const row = () => <RowBones />;
/** One plate — for a small box only; a page never waits as one grey bar. */
export const plate = () => <Skeleton className="h-24 w-full rounded-lg" />;
export const chart = () => <Skeleton className="h-48 w-full rounded-lg" />;
export const ticket = () => (
  <>
    <Skeleton className="h-12 w-full rounded-md" />
    <Skeleton className="h-12 w-full rounded-md" />
    <Skeleton className="h-(--ticket-cta-height) w-full rounded-md" />
  </>
);
/** Any page: its head and a grid of cards. */
export const page = () => (
  <div className="flex flex-col gap-8">
    <HeadBones />
    <div className="skel-grid">
      <TileBones />
      <TileBones />
      <TileBones />
    </div>
  </div>
);
export const tiles = () => (
  <div className="skel-grid">
    {[0, 1, 2, 3, 4, 5].map((i) => <TileBones key={i} />)}
  </div>
);
export const table = () => (
  <div className="skel-card gap-0 py-1">
    {[0, 1, 2, 3, 4].map((i) => <RowBones key={i} />)}
  </div>
);
/** /markets' lane while it loads: the tabs, the ticker chips and the first Window cards. */
export const cards = () => (
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
);
