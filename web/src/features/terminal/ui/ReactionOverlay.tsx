"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/ReactionOverlay.tsx — `m.*` inside the terminal's MotionScope
// (LazyMotion strict), Mitoshi's tokens (`terminal.css` `.tm-flash-*`, `.tm-callout`).
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { FrameInfo } from "../chart/chart-engine";
import { CALLOUT_LIFETIME_MS, type CalloutTone } from "../feedback/reactions";

export interface ReactionOverlayHandle {
  callout(tone: CalloutTone, emoji: string, text: string): void;
  flash(favorable: boolean, mega: boolean): void;
  /** Called every chart frame: the callout stack follows the line's head. */
  frame(info: FrameInfo | null): void;
}

interface Shown {
  id: number;
  tone: CalloutTone;
  emoji: string;
  text: string;
}

/**
 * Tradash's reactions overlay: an inset edge glow for 0.9 s on a surge (up colour) or slump (down colour), and emoji
 * callouts that ride the price head — at most two, each living by its tone, springing in and lifting out. Reduced
 * motion: a plain fade.
 */
export function ReactionOverlay({ handle }: { handle: Ref<ReactionOverlayHandle> }) {
  const reduce = useReducedMotion();
  const head = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown[]>([]);
  const [flash, setFlash] = useState<{ id: number; favorable: boolean; mega: boolean } | null>(null);
  const seq = useRef(0);

  useImperativeHandle(handle, () => ({
    callout(tone, emoji, text) {
      const id = ++seq.current;
      setShown((s) => [...s, { id, tone, emoji, text }].slice(-2));
      setTimeout(() => setShown((s) => s.filter((x) => x.id !== id)), CALLOUT_LIFETIME_MS[tone]);
    },
    flash(favorable, mega) {
      const id = ++seq.current;
      setFlash({ id, favorable, mega });
      setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 900);
    },
    frame(info) {
      const el = head.current;
      if (el && info) el.style.transform = `translate3d(${info.headX}px, ${info.headY}px, 0)`;
    },
  }));

  useEffect(() => () => setShown([]), []);

  return (
    <div aria-hidden className="tm-reactions">
      <AnimatePresence>
        {flash ? (
          <m.div
            key={flash.id}
            className={`tm-flash ${flash.favorable ? "tm-flash-up" : "tm-flash-down"}${flash.mega ? " is-mega" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.6, 0] }}
            transition={{ duration: 0.9, times: [0, 0.15, 0.5, 1] }}
          />
        ) : null}
      </AnimatePresence>
      <div ref={head} className="tm-head">
        <div className="tm-callouts">
          <AnimatePresence>
            {shown.map((c) => (
              <m.div
                key={c.id}
                data-tone={c.tone}
                className="tm-callout"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: 14, rotate: c.tone === "epic" ? -8 : 0 }}
                animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.9 }}
                transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: c.tone === "epic" ? 14 : 22 }}
              >
                <span className="tm-callout-emoji">{c.emoji}</span>
                {c.text}
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
