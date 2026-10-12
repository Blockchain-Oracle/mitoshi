"use client";
// R4-0 (D-227): the floating seal (Ported from Owarine 90a91d71:web/src/features/sensei/SenseiDock.tsx) never sits on
// a primary action. On a 1280 × 720 laptop it covered the end of the ticket's button, and at 1024 × 768 its teaser
// did (phones hide the seal outright). Anything marked `data-primary-action` — the ticket's TxCta, the hero's UP/DOWN —
// moves it aside while the two meet; the teaser stays quiet while the band above the seal is taken. Sensei is still
// in the rail and the hero foot.
import { useEffect, useState, type RefObject } from "react";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The band a teaser pops into above the seal: the widest teaser plus its tail, and the gap. */
const TEASER_BAND_W = 140;
const TEASER_BAND_H = 48;
/** Air kept between the seal and an action, so a thumb never lands on both. */
const AIR = 8;

/** True when `box`, grown by `air`, meets any of `targets`. */
export function meetsAny(box: Box, targets: readonly Box[], air = AIR): boolean {
  return targets.some((t) => t.right > box.left - air && t.left < box.right + air && t.bottom > box.top - air && t.top < box.bottom + air);
}

/** The seal's own box and the teaser band above it, from the wrap's corner and the seal's layout size (no transforms). */
export function sealZones(corner: { right: number; bottom: number }, seal: { width: number; height: number }): { seal: Box; band: Box } {
  const top = corner.bottom - seal.height;
  return {
    seal: { left: corner.right - seal.width, top, right: corner.right, bottom: corner.bottom },
    band: { left: corner.right - Math.max(seal.width, TEASER_BAND_W), top: top - TEASER_BAND_H, right: corner.right, bottom: top },
  };
}

export const PRIMARY_ACTION = "[data-primary-action]";

/** `aside`: the seal would cover an action; `hush`: a teaser would. Checked on scroll, resize and any layout change. */
export function useStepAside(wrap: RefObject<HTMLElement | null>, seal: RefObject<HTMLElement | null>): { aside: boolean; hush: boolean } {
  const [state, setState] = useState({ aside: false, hush: false });
  useEffect(() => {
    const wrapEl = wrap.current;
    const sealEl = seal.current;
    if (!wrapEl || !sealEl) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const corner = wrapEl.getBoundingClientRect();
      if (corner.width === 0) return setState((s) => (s.aside || s.hush ? { aside: false, hush: false } : s));
      const zones = sealZones(corner, { width: sealEl.offsetWidth, height: sealEl.offsetHeight });
      const targets = [...document.querySelectorAll(PRIMARY_ACTION)].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      const aside = meetsAny(zones.seal, targets);
      const hush = aside || meetsAny(zones.band, targets);
      setState((s) => (s.aside === aside && s.hush === hush ? s : { aside, hush }));
    };
    const schedule = () => void (frame ||= requestAnimationFrame(check));
    schedule();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    // The ticket's height sets the hero's (the chart stretches to it), so a moved button resizes the page.
    const resized = new ResizeObserver(schedule);
    resized.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      resized.disconnect();
    };
  }, [wrap, seal]);
  return state;
}
