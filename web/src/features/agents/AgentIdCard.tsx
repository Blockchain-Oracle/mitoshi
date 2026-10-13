"use client";
// From 21st.dev 31599 aadarshm/agent-id (the draggable identity card on an elastic ribbon), revamped: the card is the
// agent's ERC-8004 identity — its name, its id on the registry, its runner and model — on Mitoshi's tokens, no gradients,
// no remote fonts or avatars; the barcode is drawn from the agent's on-chain id (deterministic, the source's bar
// algorithm), the ribbon follows the card, and the drag springs back (arrow keys nudge it; Escape resets). R4-6 (D-227):
// it sits in the cockpit's Identity tab, and on a coarse pointer it doesn't drag at all (pan-y scrolls the page).
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

/** The source's bar pattern, seeded by the value (same value → same bars). */
export function barcodeBars(value: string): { dark: boolean; width: number }[] {
  let state = 19;
  const bars = [{ dark: true, width: 2 }, { dark: false, width: 1 }, { dark: true, width: 1 }];
  for (const [index, ch] of Array.from(value).entries()) {
    state = (state * 31 + ch.charCodeAt(0) + index * 17) % 997;
    bars.push({ dark: true, width: 1 + (state % 3) }, { dark: false, width: 1 + ((state >> 2) % 2) }, { dark: true, width: 1 + ((state >> 4) % 3) }, { dark: false, width: 1 });
  }
  bars.push({ dark: true, width: 1 }, { dark: false, width: 1 }, { dark: true, width: 2 });
  return bars;
}

export interface AgentIdCardProps {
  name: string;
  agentId: string;
  registry: string;
  runner: string;
  model: string | null;
  kind: string;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A coarse pointer (a phone) scrolls through the card instead of dragging it (R4-6, automate bug 3). */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return coarse;
}

export function AgentIdCard({ name, agentId, registry, runner, model, kind }: AgentIdCardProps) {
  const coarse = useCoarsePointer();
  const reduce = useReducedMotion() || coarse;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 320, damping: 18, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 320, damping: 18, mass: 0.6 });
  const rotate = useTransform(sx, [-160, 160], [-9, 9]);
  // The ribbon: from the hook above the card to its clip, bending with the card.
  const ribbon = useTransform([sx, sy] as never, ([cx, cy]: number[]) => `M 120 0 Q ${120 + (cx ?? 0) * 0.35} ${40 + (cy ?? 0) * 0.4} ${120 + (cx ?? 0)} ${72 + (cy ?? 0)}`);
  const bars = useMemo(() => barcodeBars(`${registry}:${agentId}`), [registry, agentId]);
  const total = bars.reduce((s, b) => s + b.width, 0);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 28 : 12;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (e.key === "Escape") {
      x.set(0);
      y.set(0);
      return;
    }
    if (!move) return;
    e.preventDefault();
    x.set(Math.max(-160, Math.min(160, x.get() + move[0]!)));
    y.set(Math.max(-40, Math.min(120, y.get() + move[1]!)));
    window.setTimeout(() => {
      x.set(0);
      y.set(0);
    }, 450);
  };
  return (
    <div className="relative mx-auto flex w-full max-w-sm flex-col items-center">
      <svg aria-hidden viewBox="0 0 240 80" className="h-20 w-60 overflow-visible text-ink-muted">
        <circle cx="120" cy="2" r="3" className="fill-current" />
        <motion.path d={reduce ? "M 120 0 L 120 72" : ribbon} className="fill-none stroke-current" strokeWidth={6} strokeLinecap="round" opacity={0.35} />
      </svg>
      <motion.div
        role="group"
        tabIndex={0}
        aria-label={`${name} — ERC-8004 agent #${agentId}`}
        onKeyDown={onKey}
        drag={!reduce}
        dragSnapToOrigin
        dragElastic={0.35}
        dragConstraints={{ left: -160, right: 160, top: -40, bottom: 120 }}
        onDrag={(_, info) => {
          x.set(info.offset.x);
          y.set(info.offset.y);
        }}
        onDragEnd={() => {
          x.set(0);
          y.set(0);
        }}
        style={reduce ? undefined : { x: sx, y: sy, rotate }}
        className={reduce ? "-mt-2 flex w-full touch-pan-y flex-col gap-4 rounded-xl border border-hairline bg-surface-1 p-5 shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring" : "-mt-2 flex w-full cursor-grab touch-none flex-col gap-4 rounded-xl border border-hairline bg-surface-1 p-5 shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"}
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-surface-2" aria-hidden />
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-label-micro text-ink-secondary">{kind}</span>
          <span className="font-mono type-caption text-ink-secondary">#{agentId}</span>
        </div>
        <p className="type-title text-ink">{name}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 type-caption">
          <dt className="text-ink-secondary">Registry</dt>
          <dd className="truncate font-mono text-ink">{registry}</dd>
          <dt className="text-ink-secondary">Runner</dt>
          <dd className="font-mono text-ink">{short(runner)}</dd>
          {model && (
            <>
              <dt className="text-ink-secondary">Model</dt>
              <dd className="truncate text-ink">{model}</dd>
            </>
          )}
        </dl>
        <svg aria-hidden viewBox={`0 0 ${total} 24`} preserveAspectRatio="none" className="h-10 w-full text-ink">
          {bars.reduce<{ at: number; el: React.ReactNode[] }>(
            (acc, b, i) => {
              if (b.dark) acc.el.push(<rect key={i} x={acc.at} y={0} width={b.width} height={24} className="fill-current" />);
              acc.at += b.width;
              return acc;
            },
            { at: 0, el: [] },
          ).el}
        </svg>
      </motion.div>
    </div>
  );
}
