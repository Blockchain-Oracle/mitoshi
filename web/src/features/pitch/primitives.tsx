"use client";
// Ported from Masayume 52a86fc:web/src/features/pitch/primitives.tsx unchanged.

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The folio's typographic furniture — ported from `reference/yosuku/app/pitch/page.tsx`
 * L30–273. The reference writes every value inline (`fontSize: 22`, `PAPER`, `HAIR`);
 * `design-literals` bans hex and px in TSX, so each becomes a class in `pitch.css`
 * with the source value named above the rule.
 *
 * Motion: framer-motion is not installed. The reference's `rise` variant with a
 * staggered parent becomes the `pitch-rise` keyframe, delayed per child by `--i`.
 */

type Tone = "ink" | "live" | "verm";

/** One risen element; `i` is its place in the parent's stagger order (reference: staggerChildren 0.08). */
export function Rise({ i = 0, className, children, style }: { i?: number; className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={cn("pitch-rise", className)} style={{ ...style, "--i": i } as CSSProperties}>
      {children}
    </div>
  );
}

/* ── the "stub": ticket-perforation emphasis (reference L31–45) ── */
export function Emph({ children, delay = 0.55 }: { children: ReactNode; delay?: number }) {
  return (
    <span className="pitch-emph" style={{ "--emph-delay": `${delay}s` } as CSSProperties}>
      <span className="pitch-emph-text">{children}</span>
      <span aria-hidden className="pitch-emph-line" />
      <span aria-hidden className="pitch-emph-dot" />
    </span>
  );
}

/* font-mono uppercase, letterSpacing 0.16em (reference L47) */
export function Mono({ children, className, tone }: { children: ReactNode; className?: string; tone?: Tone | "mute" | "faint" }) {
  return (
    <span className={cn("pitch-mono", className)} data-tone={tone}>
      {children}
    </span>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <Rise className="pitch-kicker">
      <span className="pitch-kicker-square" aria-hidden />
      {children}
    </Rise>
  );
}

export type SpecRow = readonly [string, ReactNode, boolean?];

/** Cover hero facts: bold Sora values (reference L225–245). */
export function Glance({ title, badge, rows, i = 1 }: { title: string; badge: string; rows: readonly SpecRow[]; i?: number }) {
  return (
    <Rise i={i} className="pitch-glance">
      <div className="pitch-glance-head">
        <Mono className="pitch-glance-title">{title}</Mono>
        <Mono className="pitch-glance-badge" tone="live">
          {badge}
        </Mono>
      </div>
      <div className="pitch-rule">
        <span className="pitch-rule-eyelet" />
      </div>
      {rows.map(([k, v, hl], index) => (
        <div key={index} className="pitch-glance-row">
          <Mono className="pitch-glance-key" tone="faint">
            {k}
          </Mono>
          {typeof v === "string" ? (
            <span className="pitch-glance-val" data-hl={hl ? "true" : undefined}>
              {v}
            </span>
          ) : (
            <span className="pitch-glance-el">{v}</span>
          )}
        </div>
      ))}
    </Rise>
  );
}

/** now/next/then phase cards (reference L259–267). */
export function PhaseCard({ tag, title, body, tone = "ink", i = 1 }: { tag: string; title: string; body: string; tone?: "ink" | "live"; i?: number }) {
  return (
    <Rise i={i} className="pitch-phase">
      <div className="pitch-phase-card" data-tone={tone}>
        <Mono className="pitch-phase-tag" tone={tone === "live" ? "live" : "verm"}>
          {tag}
        </Mono>
        <div className="pitch-phase-title">{title}</div>
        <div className="pitch-phase-body">{body}</div>
      </div>
    </Rise>
  );
}

/** Registration tick at one corner of the folio frame (reference L636–644). */
export function Tick({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  return (
    <span className="pitch-tick" data-pos={pos} aria-hidden>
      <span className="pitch-tick-v" />
      <span className="pitch-tick-h" />
    </span>
  );
}
