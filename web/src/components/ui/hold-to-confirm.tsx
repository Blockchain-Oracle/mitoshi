"use client";

// From 21st.dev 23527 (Hold to Confirm) — revamped per D-044 for the trust surface's revoke-all (D-053): Masayume tokens
// instead of stone/hex literals, `m.*` under LazyMotion, a 44 px target, the accent fill sweeping as the hold fills,
// and the component's own accessibility kept (press-and-hold hint, Space/Enter to hold, Escape cancels, releasing early
// does nothing, pointer drift cancels). Reduced motion: no sweep animation, same timing.
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type HoldPhase = "idle" | "holding" | "releasing" | "committed";

function useHold({ onConfirm, duration, disabled }: { onConfirm: () => void; duration: number; disabled: boolean }) {
  const [phase, setPhase] = useState<HoldPhase>("idle");
  const phaseRef = useRef<HoldPhase>("idle");
  const down = useRef(false);
  const elapsed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const confirm = useRef(onConfirm);
  useEffect(() => {
    confirm.current = onConfirm;
  }, [onConfirm]);

  const move = useCallback((next: HoldPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const reset = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    down.current = false;
    elapsed.current = 0;
    move("idle");
  }, [move]);

  const begin = useCallback(
    (point?: { x: number; y: number }) => {
      if (disabled || phaseRef.current === "committed" || phaseRef.current === "holding") return;
      origin.current = point ?? null;
      down.current = true;
      move("holding");
      if (raf.current) return;
      last.current = performance.now();
      const loop = (now: number) => {
        const dt = Math.min(64, now - last.current);
        last.current = now;
        elapsed.current += down.current ? dt : -dt * 2.5;
        if (elapsed.current >= duration) {
          raf.current = 0;
          down.current = false;
          move("committed");
          navigator.vibrate?.(14);
          confirm.current();
          return;
        }
        if (elapsed.current <= 0) {
          raf.current = 0;
          elapsed.current = 0;
          move("idle");
          return;
        }
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    },
    [disabled, duration, move],
  );
  const release = useCallback(() => {
    if (phaseRef.current !== "holding") return;
    down.current = false;
    origin.current = null;
    move("releasing");
  }, [move]);

  useEffect(() => {
    const onHide = () => document.hidden && release();
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onHide);
      cancelAnimationFrame(raf.current);
    };
  }, [release]);

  const bind = {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      begin({ x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: PointerEvent) => {
      const from = origin.current;
      if (phaseRef.current === "holding" && from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) release();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Escape" && (phaseRef.current === "holding" || phaseRef.current === "releasing")) {
        e.preventDefault();
        reset();
      } else if (!e.repeat && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        begin();
      }
    },
    onKeyUp: (e: KeyboardEvent) => (e.key === " " || e.key === "Enter") && release(),
    onBlur: release,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
  return { bind, phase, reset };
}

export interface HoldToConfirmProps {
  onConfirm: () => void;
  children: ReactNode;
  /** What the button says once the hold completes (e.g. "Revoking…"). */
  confirmLabel: string;
  duration?: number;
  disabled?: boolean;
  className?: string;
}

export function HoldToConfirm({ onConfirm, children, confirmLabel, duration = 1_800, disabled = false, className }: HoldToConfirmProps) {
  const { bind, phase } = useHold({ onConfirm, duration, disabled });
  const reduced = useReducedMotion();
  const hintId = useId();
  const committed = phase === "committed";
  const swept = useMotionValue(0);
  const clipPath = useTransform(swept, (v) => `inset(0 ${(1 - v) * 100}% 0 0)`);

  useEffect(() => {
    if (reduced) {
      swept.set(phase === "holding" || committed ? 1 : 0);
      return;
    }
    const from = swept.get();
    const controls =
      phase === "holding" || committed
        ? animate(swept, 1, { duration: committed ? 0.12 : (duration * (1 - from)) / 1_000, ease: "linear" })
        : animate(swept, 0, { duration: (duration * from) / 2.5 / 1_000, ease: [0.23, 1, 0.32, 1] });
    return () => controls.stop();
  }, [phase, committed, duration, reduced, swept]);

  const face = committed ? confirmLabel : children;
  return (
    <button
      type="button"
      aria-disabled={disabled || committed}
      aria-describedby={hintId}
      {...bind}
      style={{ touchAction: "manipulation", WebkitTouchCallout: "none" }}
      className={cn(
        "relative isolate inline-grid min-h-touch select-none place-items-center overflow-hidden rounded-md border border-border-strong bg-surface-1 px-4 type-body-strong text-ink focus-visible:outline-2 focus-visible:outline-accent",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <span className="whitespace-nowrap">{face}</span>
      <m.span aria-hidden style={{ clipPath }} className="absolute inset-0 grid place-items-center whitespace-nowrap bg-accent-fill px-4 text-on-accent">
        {face}
      </m.span>
      <span id={hintId} className="sr-only">
        Press and hold for {Math.round(duration / 100) / 10} seconds to confirm. Releasing early cancels and nothing happens.
      </span>
      <span role="status" aria-live="polite" className="sr-only">{committed ? confirmLabel : ""}</span>
    </button>
  );
}
