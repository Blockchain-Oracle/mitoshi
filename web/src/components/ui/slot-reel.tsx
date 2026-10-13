"use client";
// From 21st.dev 33159 adrielzimbril/handle-reel, by way of Senryo:apps/web/src/components/ui/slot-reel.tsx (its
// revamp for Lucky's machine), revamped again onto Mitoshi's tokens (R4-9, D-227; docs/design/components.md): one
// continuous strip that tumbles while the draw is made and, `stopAfterMs` past the sealed draw (the machine's
// 720 / 980 / 1240 ms stagger), stops in a short settle that overshoots a few pixels and springs back — a thunk, not a
// glide. `onTick` fires as each row passes the payline (the ratchet), `onLand` when the motion ends. Reduced motion —
// the OS's or the games frame's own `data-reduced-motion` — lands at once. Styles: `.slot-*` in the games' lucky.css.
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrameReducedMotion } from "@/lib/frame-motion";
import { cn } from "@/lib/utils";

const ROWS = 3;
const CYCLES = 3;
const SPIN_SEC = 1.2;
const HALF = 2;
const SETTLE_SEC = 0.3;
/** Overshoots ≈ 4 px on a row and returns. */
const OVERSHOOT = [0.34, 1.56, 0.64, 1] as const;
const TICK_GAP_MS = 60;

function shuffled<T>(xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function SlotReel<T extends string | number>(p: {
  items: readonly T[];
  /** The value to land on; null while the draw is still being made (the reel keeps tumbling). */
  target: T | null;
  /** A new number starts a new spin; 0 is the machine at rest. */
  spinId: number;
  label: string;
  face: (item: T) => ReactNode;
  stopAfterMs: number;
  onTick?: () => void;
  onLand?: () => void;
  /** The landed row's tone, for its light. */
  tone?: string;
  className?: string;
}) {
  const osReduce = useReducedMotion() === true;
  const root = useRef<HTMLDivElement>(null);
  const frame = useFrameReducedMotion(root);
  const reduce = frame ?? osReduce;
  const y = useMotionValue(0);
  const probe = useRef<HTMLDivElement>(null);
  const [row, setRow] = useState(0);
  const [landed, setLanded] = useState(false);
  const centre = Math.floor(ROWS / HALF);

  const track = useMemo(() => {
    const pool = p.items.length > 0 ? [...p.items] : [];
    // At rest the reel is in order (server and first client render match); a spin reshuffles, the target at `centre`.
    const order = (xs: readonly T[]) => (p.spinId === 0 ? [...xs] : shuffled(xs));
    const lead = order(pool).slice(0, centre);
    const spins = Array.from({ length: CYCLES }, () => order(pool)).flat();
    return [...lead, p.target ?? pool[0]!, ...spins];
  }, [p.spinId, p.target, p.items, centre]);

  useLayoutEffect(() => {
    const h = probe.current?.offsetHeight ?? 0;
    if (h && h !== row) setRow(h);
  }, [row]);

  const tick = useRef(p.onTick);
  tick.current = p.onTick;
  const land = useRef(p.onLand);
  land.current = p.onLand;
  useEffect(() => {
    if (!row) return;
    let last = Math.round(y.get() / row);
    let lastAt = 0;
    return y.on("change", (v) => {
      const i = Math.round(v / row);
      const now = performance.now();
      if (i !== last && now - lastAt >= TICK_GAP_MS) {
        lastAt = now;
        tick.current?.();
      }
      last = i;
    });
  }, [row, y]);

  const at = (i: number) => (row * ROWS) / HALF - (i * row + row / HALF);

  useEffect(() => {
    if (!row) return;
    if (p.spinId === 0) {
      y.set(at(centre));
      return;
    }
    setLanded(false);
    const tumble = () => {
      y.set(at(track.length - 1));
      return animate(y, [at(track.length - 1), at(centre + 1)], { duration: SPIN_SEC, ease: "linear", repeat: Number.POSITIVE_INFINITY });
    };
    if (p.target === null) {
      if (reduce) return;
      const loop = tumble();
      return () => loop.stop();
    }
    if (reduce) {
      y.set(at(centre));
      setLanded(true);
      land.current?.();
      return;
    }
    const loop = tumble();
    let settle: ReturnType<typeof animate> | undefined;
    const timer = setTimeout(() => {
      loop.stop();
      y.set(at(centre + 1));
      settle = animate(y, at(centre), {
        duration: SETTLE_SEC,
        ease: OVERSHOOT,
        onComplete: () => {
          setLanded(true);
          land.current?.();
        },
      });
    }, p.stopAfterMs);
    return () => {
      clearTimeout(timer);
      loop.stop();
      settle?.stop();
    };
    // `at` and `track.length` follow `row` and the spin.
  }, [row, p.spinId, p.target, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={root} className={cn("slot", p.className)} data-landed={landed && p.target !== null ? "" : undefined} data-tone={p.tone}>
      <span className="slot-label">{p.label}</span>
      <div role="status" className="slot-window" style={{ height: row ? row * ROWS : undefined }} aria-live="polite" aria-label={landed && p.target !== null ? `${p.label}: ${p.target}` : p.label}>
        <div ref={probe} aria-hidden className="slot-row slot-probe">
          M
        </div>
        <motion.div style={{ y }} aria-hidden className="slot-strip">
          {track.map((item, i) => (
            <div key={i} className="slot-row" data-pay={landed && i === centre ? "" : undefined}>
              {p.face(item)}
            </div>
          ))}
        </motion.div>
        <span className="slot-payline" aria-hidden />
      </div>
    </div>
  );
}
