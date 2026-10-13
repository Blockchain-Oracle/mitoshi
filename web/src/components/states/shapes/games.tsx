// The games' outlines (R4-5, D-227; R6 T18, D-230): the hall waits as its own cabinet and carousel, a play route as its
// stage, a list route as its list — never three generic tiles. The hall's frames are the settled page's own classes
// (features/games/hall/hall.css, imported by the route's boundary), so its boxes are the settled boxes.
import { HeadBones, RowBones, Skeleton, T, TabBones } from "./bones";

/** A house game (Range, Moonshot): the head row, the cadence words, the Window chips, the board, the action block. */
export const game = () => (
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
);

/** The leaderboard: the head, the filters, three on the podium, the first rows. */
export const podium = () => (
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
);

/** /games: the head with the ticker strip, the featured cabinet (its PLAY full width), the carousel with the next card
 *  peeking (4-up from the desk), its dots. */
export const gamesHall = () => (
  <div className="gm-page hall">
    <header className="hall-head">
      <div className="hall-title"><T>Games</T></div>
      <div className="hall-now"><Skeleton className="h-4.5 w-full rounded-md" /></div>
      <Skeleton className="gm-rail-icon rounded-full" />
    </header>
    <section className="hall-feature">
      <div className="hall-feature-top">
        <Skeleton className="h-7 w-14 rounded-md" />
        <Skeleton className="h-3.5 w-28 rounded-md" />
      </div>
      <div className="hall-feature-body">
        <Skeleton className="gm-disc hall-feature-disc rounded-full" />
        <div className="hall-feature-id">
          <span className="hall-feature-asset"><T>AAPL</T></span>
          <span className="hall-feature-cadence"><T>15m Window</T></span>
        </div>
        <Skeleton className="kit-ring hall-feature-ring rounded-full" />
      </div>
      <div className="hall-feature-quote"><span className="hall-price"><T>$000.00</T></span></div>
      <Skeleton className="hall-play h-13 w-full rounded-full" bone="cta" />
    </section>
    <div className="cab-wrap">
      <ul className="cab-rail">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="cab">
            <Skeleton className="cab-screen rounded-lg" />
            <div className="cab-foot">
              <div className="cab-id"><T>Line Rider</T></div>
              <span className="cab-fact"><T>Ride the live price</T></span>
              <Skeleton className="h-11 w-full rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

/** A play route (Practice, Lucky, Duel): its head row, the stage, the action block. */
export const gameStage = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Skeleton className="h-7 w-32 rounded-md" />
      <Skeleton className="ml-auto h-9 w-24 rounded-full" />
      <Skeleton className="size-9 rounded-full" />
    </div>
    <Skeleton className="h-72 w-full rounded-xl" bone="stage" />
    <Skeleton className="h-(--ticket-cta-height) w-full rounded-full" />
    <Skeleton className="h-3 w-2/3 self-center rounded-md" />
  </div>
);

/** A list route (Rank, History): its head row, the filter tabs, the rows. */
export const gameList = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Skeleton className="h-7 w-32 rounded-md" />
      <Skeleton className="ml-auto size-9 rounded-full" />
    </div>
    <TabBones n={3} />
    <div className="skel-card gap-0 py-1" data-bone="list">
      {[0, 1, 2, 3, 4, 5].map((i) => <RowBones key={i} />)}
    </div>
  </div>
);
