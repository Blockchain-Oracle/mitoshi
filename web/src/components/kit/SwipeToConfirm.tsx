"use client";
// Ported from Owarine 90a91d71:web/src/components/kit/SwipeToConfirm.tsx (R4-2, D-227) — UGLYCASH's money gesture: drag
// the thumb to the end of the pill to confirm, so a trade is never one stray tap; let go early and it springs back.
// Keyboard and switch users press the thumb (Enter or Space) — the gesture is a guard, not a gate. `state` is the
// caller's: idle → busy while the chain answers → done, announced once (aria-live). The drag is plain pointer events
// and a CSS variable (no motion runtime); the spring back is a CSS transition, off under reduced motion. Inside a sheet,
// Base UI's drawer would read the drag as a swipe to dismiss — the root opts out (`data-base-ui-swipe-ignore`).
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

export interface SwipeToConfirmProps {
  label: string;
  onConfirm: () => void;
  state?: "idle" | "busy" | "done";
  doneLabel: string;
  busyLabel: string;
  tone?: "accent" | "ink";
  disabled?: boolean;
  className?: string;
}

/** Past 86 % of the track, or past half of it at a flick, counts as a confirm. */
const REACH = 0.86;
const FLICK_REACH = 0.5;
const FLICK_PX_PER_MS = 0.9;

export function SwipeToConfirm({ label, onConfirm, state = "idle", doneLabel, busyLabel, tone = "accent", disabled, className }: SwipeToConfirmProps) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; from: number; at: number; t: number; v: number } | null>(null);
  const [max, setMax] = useState(0);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // A confirm parks the thumb at the end until the caller's state moves (busy, done, or back to idle).
  const [parked, setParked] = useState(false);
  useEffect(() => setParked(false), [state]);
  const locked = state !== "idle" || disabled === true;

  useLayoutEffect(() => {
    const el = track.current;
    const knob = thumb.current;
    if (!el || !knob) return;
    const measure = () => {
      const pad = knob.offsetLeft;
      setMax(Math.max(0, el.clientWidth - knob.offsetWidth - pad * 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Busy and done park the thumb at the end; a reset to idle brings it home.
  const shown = dragging ? x : state !== "idle" || parked ? max : 0;

  const confirm = () => {
    setParked(true);
    onConfirm();
  };
  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (locked || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, from: e.clientX, at: 0, t: e.timeStamp, v: 0 };
    setX(0);
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const at = Math.min(max, Math.max(0, e.clientX - d.from));
    const dt = Math.max(1, e.timeStamp - d.t);
    drag.current = { ...d, at, t: e.timeStamp, v: (at - d.at) / dt };
    setX(at);
  };
  /** Judge the release by where the pointer went and how fast, not the last painted frame (a quick flick on a slow phone). */
  const onUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    const reached = Math.min(max, Math.max(d.at, e.clientX - d.from));
    if (!locked && max > 0 && (reached >= max * REACH || (reached >= max * FLICK_REACH && d.v > FLICK_PX_PER_MS))) confirm();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (locked || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    confirm();
  };

  const text = state === "busy" ? busyLabel : state === "done" ? doneLabel : label;
  const fade = max > 0 ? Math.max(0, 1 - shown / (max * 0.6)) : 1;
  return (
    <div
      ref={track}
      data-slot="swipe-to-confirm"
      data-state={state}
      data-tone={tone}
      data-dragging={dragging ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      data-base-ui-swipe-ignore=""
      className={cn("kit-swipe", className)}
      style={{ "--kit-x": `${shown}px`, "--kit-label": fade } as CSSProperties}
    >
      <span aria-hidden className="kit-swipe-fill" />
      <span aria-live="polite" className="kit-swipe-label">{text}</span>
      <button
        ref={thumb}
        type="button"
        className="kit-swipe-thumb"
        aria-label={state === "idle" ? label : text}
        disabled={locked}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        {state === "busy" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : state === "done" ? <Check aria-hidden strokeWidth={3} /> : <ArrowRight aria-hidden strokeWidth={2.75} />}
      </button>
    </div>
  );
}
