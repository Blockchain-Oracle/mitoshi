"use client";
// Ported from Masayume 52a86fc:web/src/features/pitch/PitchDeck.tsx — Mitoshi's mark and words (`copy.ts`); the folio,
// its navigation and its CSS (`styles/pitch*.css`, imported here so only /pitch carries them) unchanged.

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import "@/styles/pitch.css";
import "@/styles/pitch-slides.css";
import { PITCH } from "./copy";
import { Mono, Tick } from "./primitives";
import { SLIDES } from "./slides";

/**
 * The folio — ported from `reference/yosuku/app/pitch/page.tsx` L646–696.
 *
 * A `fixed inset-0` paper surface above the whole app: the reference renders no
 * header, marquee or footer on this route, and `pitch.css` hides ours the same way
 * `reel.css` hides the footer under the reel. Paper in both themes, as the reference —
 * a designed presentation surface, not a dark island. Nav: ← → space ↑ ↓ Home End,
 * the dots, and the two round buttons.
 *
 * Motion is CSS: the reference's `AnimatePresence mode="wait"` swap becomes a re-keyed
 * slide root that re-runs the `pitch-rise` keyframes (there is no exit animation).
 */
export function PitchDeck() {
  const slides = SLIDES;
  const total = slides.length;
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const go = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(total - 1, i + d))), [total]);
  const goto = useCallback((i: number) => setIndex(Math.max(0, Math.min(total - 1, i))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") goto(0);
      else if (e.key === "End") goto(total - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goto, total]);

  // A short viewport scrolls the stage (pitch.css); a new slide always opens at its top.
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [index]);

  const slide = slides[index]!;
  const folio = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  return (
    <div className="pitch-deck" data-paper={slide.paper ?? 1}>
      <div className="pitch-frame">
        <Tick pos="tl" />
        <Tick pos="tr" />
        <Tick pos="bl" />
        <Tick pos="br" />

        <div className="pitch-head">
          <div className="pitch-brand">
            <MitoshiMark className="pitch-brand-mark" />
            <span className="pitch-brand-name">{PITCH.brand}</span>
          </div>
          <Mono className="pitch-folio" tone="faint">
            [ {folio} ] · {slide.section}
          </Mono>
        </div>

        <div ref={stageRef} className="pitch-stage">
          <div key={slide.id} className="pitch-slide">
            {slide.render()}
          </div>
        </div>

        <div className="pitch-foot">
          <Mono className="pitch-foot-brand" tone="faint">
            {PITCH.brand}
          </Mono>
          <div className="pitch-dots">
            {slides.map((s, i) => (
              <button key={s.id} type="button" onClick={() => goto(i)} aria-label={PITCH.slideLabel(i + 1)} className="pitch-dot" data-active={i === index} />
            ))}
          </div>
          <Mono className="pitch-foot-chain" tone="faint">
            {PITCH.builtOn}
          </Mono>
        </div>
      </div>

      <button type="button" onClick={() => go(-1)} className="pitch-nav pitch-nav-prev" aria-label={PITCH.prev} title={PITCH.prev}>
        <ArrowLeftIcon size={17} />
      </button>
      <button type="button" onClick={() => go(1)} className="pitch-nav pitch-nav-next" aria-label={PITCH.next} title={PITCH.next}>
        <ArrowRightIcon size={17} />
      </button>
    </div>
  );
}
