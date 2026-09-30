"use client";
/**
 * From 21st.dev 24692 motiondotdev/motion-confetti — revamped per D-044 as the verdict's one celebration: a single burst
 * over a winning stamp, fired once by the host (never a button), the particles in the brand's accent, cream and ink
 * tokens instead of seven hex colours, fewer of them (36) and a shorter flight, and nothing at all under reduced motion
 * (the source had no guard). Motion's imperative `animate` drives each particle outside React, the source's physics kept.
 */
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const COLORS = ["var(--color-accent)", "var(--color-cream)", "var(--color-ink)", "var(--color-profit)"];
const SHAPES = ["circle", "rect", "strip"] as const;
const FRAMES = 36;

interface Particle {
  keyframes: { transform: string[]; opacity: number[] };
  size: number;
  color: string;
  shape: (typeof SHAPES)[number];
}

function flight(angle: number, speed: number, rotation: number, tilt: number): Particle["keyframes"] {
  const transform: string[] = [];
  const opacity: number[] = [];
  let [x, y, v] = [0, 0, speed];
  for (let i = 0; i <= FRAMES; i++) {
    const t = i / FRAMES;
    if (i > 0) for (let k = 0; k < 3; k++) {
      x += Math.cos(angle) * v;
      y += Math.sin(angle) * v + 3;
      v *= 0.91;
    }
    transform.push(`translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotateY(${(tilt * 360 * t).toFixed(0)}deg) rotate(${rotation}deg)`);
    opacity.push(t <= 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) * 2));
  }
  return { transform, opacity };
}

function Dot({ p, duration }: { p: Particle; duration: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const run = animate(ref.current, p.keyframes, { duration, ease: "linear" });
    return () => run.cancel();
  }, [p, duration]);
  const w = p.shape === "strip" ? p.size * 0.3 : p.shape === "rect" ? p.size * 0.7 : p.size;
  return <span ref={ref} className="confetti-dot" style={{ width: w, height: p.shape === "strip" ? p.size * 2 : p.size, background: p.color, borderRadius: p.shape === "circle" ? "50%" : 1 }} />;
}

/** Fires one burst when `fire` turns true; renders nothing under reduced motion. */
export function ConfettiBurst({ fire, count = 36, duration = 1.8 }: { fire: boolean; count?: number; duration?: number }) {
  const reduce = useReducedMotion() === true;
  const [particles, setParticles] = useState<Particle[] | null>(null);
  useEffect(() => {
    if (!fire || reduce) return;
    setParticles(
      Array.from({ length: count }, () => {
        const spread = (100 * Math.PI) / 180;
        const angle = -Math.PI / 2 + (0.5 * spread - Math.random() * spread);
        return {
          keyframes: flight(angle, 6 + Math.random() * 12, Math.random() * 360, 2 + Math.random() * 3),
          size: 6 + Math.random() * 6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          shape: SHAPES[Math.floor(Math.random() * SHAPES.length)]!,
        };
      }),
    );
    const done = setTimeout(() => setParticles(null), (duration + 0.3) * 1000);
    return () => clearTimeout(done);
  }, [fire, reduce, count, duration]);
  if (!particles) return null;
  return (
    <span aria-hidden className="confetti-burst">
      {particles.map((p, i) => <Dot key={i} p={p} duration={duration} />)}
    </span>
  );
}
