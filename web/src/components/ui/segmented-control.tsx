"use client";

// From 21st.dev 23552 (Segmented Control) — revamped per D-044: Masayume surfaces and ink instead of stone/hex, a
// 44 px row, the sliding thumb under `m.*` (off under reduced motion), and the radiogroup semantics kept (arrow keys,
// Home/End, roving tab index). The thumb's text is a masked copy so the selected label inverts cleanly.
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: string;
}

const SEG = "flex min-h-touch items-center justify-center px-3 text-center type-caption font-semibold whitespace-nowrap";

export function SegmentedControl<V extends string>({ options, label, value, onValueChange, className }: { options: readonly SegmentedOption<V>[]; label: string; value: V; onValueChange: (v: V) => void; className?: string }) {
  const count = Math.max(1, options.length);
  const template = `repeat(${count}, minmax(0, 1fr))`;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const reduced = useReducedMotion();
  const pos = useMotionValue(index);
  const thumbX = useTransform(pos, (v) => `${v * 100}%`);
  const maskX = useTransform(pos, (v) => `${v * -100}%`);

  useEffect(() => {
    if (reduced) return pos.set(index);
    const controls = animate(pos, index, { type: "spring", stiffness: 520, damping: 34, mass: 0.45 });
    return () => controls.stop();
  }, [index, reduced, pos]);

  const go = useCallback(
    (i: number) => {
      const o = options[(i + count) % count];
      if (!o) return;
      buttons.current[(i + count) % count]?.focus();
      onValueChange(o.value);
    },
    [options, count, onValueChange],
  );
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? count - 1 : null;
    if (next === null) return;
    e.preventDefault();
    go(next);
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("relative inline-block select-none rounded-md border border-hairline bg-surface-2 p-0.5", className)}>
      <div className="relative grid" style={{ gridTemplateColumns: template, touchAction: "manipulation" }}>
        {options.map((o) => (
          <span key={o.value} aria-hidden className={cn(SEG, "pointer-events-none text-ink-secondary")}>{o.label}</span>
        ))}
        <m.div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-sm bg-ink" style={{ width: `${100 / count}%`, x: thumbX }} initial={false}>
          <m.div className="absolute inset-0" style={{ x: maskX }} initial={false}>
            <div className="absolute inset-y-0 left-0 grid" style={{ width: `${count * 100}%`, gridTemplateColumns: template }}>
              {options.map((o) => (
                <span key={o.value} className={cn(SEG, "text-ground")}>{o.label}</span>
              ))}
            </div>
          </m.div>
        </m.div>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: template }}>
          {options.map((o, i) => (
            <button
              key={o.value}
              ref={(node) => {
                buttons.current[i] = node;
              }}
              type="button"
              role="radio"
              aria-checked={i === index}
              tabIndex={i === index ? 0 : -1}
              onClick={() => onValueChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="sr-only">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
