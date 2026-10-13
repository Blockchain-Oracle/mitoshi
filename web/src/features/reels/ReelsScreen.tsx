"use client";
// Ported from Agari 03b30ab:web/src/features/markets/reels/ReelsScreen.tsx (S13 step 9; Masayume's reel, Yosuku's
// `app/reels`) — a full-screen vertical snap feed of live Windows and people's takes, woven market, take, market…
// Native scroll-snap, not drag physics; from 21st 23559 (snap carousel) each card is a labelled slide ("3 of 18"), the
// position is announced, ↑/↓ move a card and desktop gets visible previous/next buttons. The Take button opens the
// composer bound to the Window on screen (UX fix 10). Agari's holding and desk cards have no Mitoshi counterpart yet.
// R4-2 (D-227): the open composer is `?d=take`, so Back closes it instead of leaving the feed with a half-typed take.
import { useLanes } from "@cwf/markets/react";
import { ChevronDown, ChevronUp, Feather } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { TakeComposer } from "@/features/social/TakesPanel";
import { useTakes } from "@/features/social/useTakes";
import { useNowMs } from "@/lib/clock";
import { closeDrawer, openDrawer, useOpenDrawerName } from "@/lib/drawer-param";
import { REELS } from "./copy";
import { ReelCard } from "./ReelCard";
import { ReelHolding } from "./ReelHolding";
import { isClosing, useReelRounds } from "./rounds";
import { TakeReelCard } from "./TakeReelCard";
import { useActiveReel } from "./useActiveReel";
import { useReelPosition } from "./useReelPosition";
import { reelKey, weaveReel, type ReelItem } from "./weave";

/** A real move, not the first stray pixel of momentum. */
const SCROLLED_PX = 60;
/** A take's age prints at a minute's grain, so its card re-renders once a minute. */
const MINUTE_MS = 60_000;
/** The open take composer's `?d=` name. */
const TAKE_DRAWER = "take";

/** The Window the Take button speaks to: the card on screen, or the nearest Window above it when a take is. */
function windowFor(reel: readonly ReelItem[], index: number) {
  for (let i = Math.min(index, reel.length - 1); i >= 0; i -= 1) {
    const item = reel[i];
    if (item?.kind === "market") return item.market;
  }
  return reel.find((i): i is Extract<ReelItem, { kind: "market" }> => i.kind === "market")?.market ?? null;
}

export function ReelsScreen() {
  const nowMs = useNowMs();
  const lanes = useDeferredValue(useLanes());
  const laneSet = lanes?.ok ? lanes.value : null;
  const rounds = useReelRounds(laneSet, nowMs);
  const feed = useTakes({});
  const takes = useMemo(() => feed.takes.filter((t) => !t.local), [feed.takes]);
  const reel = useMemo(() => weaveReel(rounds, takes), [rounds, takes]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const composing = useOpenDrawerName() === TAKE_DRAWER;
  const { register, isNear, activeIndex } = useActiveReel(scrollRef, reel.length);
  useReelPosition(scrollRef, reel, activeIndex);
  const minuteMs = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
  const target = windowFor(reel, activeIndex);
  const step = (dir: 1 | -1) => scrollRef.current?.scrollBy({ top: dir * scrollRef.current.clientHeight, behavior: "smooth" });

  return (
    <div className="reels-surface">
      <div ref={scrollRef} className="reel-page feed-snap" aria-label={REELS.label} aria-describedby="reel-keys" onScroll={(e) => e.currentTarget.scrollTop > SCROLLED_PX && setScrolled(true)}>
        {lanes === null || nowMs === 0 ? (
          <ReelHolding>{REELS.reading}</ReelHolding>
        ) : reel.length === 0 ? (
          <ReelHolding>{lanes.ok ? REELS.betweenRounds : REELS.readFailed}</ReelHolding>
        ) : (
          reel.map((item, index) => (
            <section key={reelKey(item)} ref={register(index)} role="group" aria-roledescription="slide" aria-label={REELS.card(index + 1, reel.length)} className="feed-card reel-slot">
              {item.kind === "market" ? (
                <ReelCard market={item.market} near={isNear(index)} closing={isClosing(item.market, nowMs)} />
              ) : (
                <TakeReelCard take={item.take} nowMs={minuteMs} />
              )}
            </section>
          ))
        )}
      </div>
      <span id="reel-keys" className="sr-only">{REELS.keys}</span>
      {reel.length > 0 ? (
        <>
          <span aria-live="polite" aria-atomic className="sr-only">{REELS.card(activeIndex + 1, reel.length)}</span>
          <span aria-hidden className="reel-count">{REELS.card(activeIndex + 1, reel.length)}</span>
          <div className="reel-steps">
            <button type="button" aria-label={REELS.prev} title={REELS.prev} disabled={activeIndex === 0} onClick={() => step(-1)}><ChevronUp aria-hidden /></button>
            <button type="button" aria-label={REELS.next} title={REELS.next} disabled={activeIndex >= reel.length - 1} onClick={() => step(1)}><ChevronDown aria-hidden /></button>
          </div>
          {target ? (
            <button type="button" className="reel-take" onClick={() => openDrawer(TAKE_DRAWER)} aria-label={REELS.postTake} title={REELS.postTake}>
              <Feather size={24} aria-hidden />
              <span>{REELS.take}</span>
            </button>
          ) : null}
          {/* Nothing else says this is a snap scroll; a viewer who never swipes would think one card is the app. */}
          <div aria-hidden className="reel-hint" data-scrolled={scrolled}>
            <ChevronUp size={20} strokeWidth={3} className="reel-hint-arrow" />
            <span className="reel-hint-pill">{REELS.swipeHint}</span>
          </div>
        </>
      ) : null}
      {composing && target ? (
        <Modal open onOpenChange={(o) => !o && closeDrawer()} fields title={REELS.composerTitle(target.asset)}>
          <TakeComposer window={{ marketId: target.marketId, asset: target.asset, intervalSec: target.intervalSec, expirySec: target.expirySec }} post={feed.post} signedIn={feed.signedIn} onPosted={closeDrawer} pinned />
        </Modal>
      ) : null}
    </div>
  );
}
