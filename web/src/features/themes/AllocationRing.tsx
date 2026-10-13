"use client";
// The mix ring's hover (R6, D-230; D-231) — the one part of `Allocation` that needs the browser: hovering or focusing a
// row or an arc dims the rest and puts that weight in the ring's centre. The rows, their percents and the issuers' marks
// come rendered from the server (`Allocation.tsx`), so the marks' artwork and the ticker registry stay out of the JS.
import { useState, type CSSProperties, type ReactNode } from "react";
import { THEMES } from "./copy";

const R = 52;
const STROKE = 13;
const C = 2 * Math.PI * R;
const T = THEMES.theme;

export interface AllocRow {
  id: string;
  symbol: string;
  /** The company and its last close ("Tesla · $374.52"). */
  sub: string;
  bps: number;
  /** The weight as a percent, and the most one call of it may stake. */
  pct: string;
  call: string;
  color: string;
}

export function AllocationRing({ rows, marks, count }: { rows: AllocRow[]; marks: ReactNode[]; count: number }) {
  const [hot, setHot] = useState<number | null>(null);
  const total = rows.reduce((s, r) => s + Math.max(0, r.bps), 0) || 1;
  let start = 0;
  const arcs = rows.map((r) => {
    const from = start;
    start += Math.max(0, r.bps);
    return { ...r, from };
  });
  const dim = (i: number) => (hot !== null && hot !== i ? "" : undefined);
  const on = (i: number) => ({ onPointerEnter: () => setHot(i), onPointerLeave: () => setHot(null) });
  return (
    <div className="th-alloc">
      <div className="th-ring" role="img" aria-label={`${T.mix}: ${rows.map((r) => `${r.symbol} ${r.pct}`).join(", ")}`}>
        <svg viewBox="0 0 132 132" className="th-ring-svg" aria-hidden>
          <circle cx={66} cy={66} r={R} fill="none" className="th-ring-track" strokeWidth={STROKE} />
          {arcs.map((a, i) => (a.bps > 0 ? (
            <circle key={a.id} cx={66} cy={66} r={R} fill="none" stroke={a.color} strokeWidth={STROKE} className="th-ring-arc" data-dim={dim(i)}
              strokeDasharray={`${Math.max(0, (a.bps / total) * C - (arcs.length > 1 ? 2 : 0))} ${C}`} strokeDashoffset={-((a.from / total) * C)} {...on(i)} />
          ) : null))}
        </svg>
        <span className="th-ring-center">
          <span className="th-ring-figure numbers">{hot === null ? count : rows[hot]!.pct}</span>
          <span className="th-ring-caption">{hot === null ? T.stocksWord(count) : rows[hot]!.symbol}</span>
        </span>
      </div>
      <ul className="th-holdings" aria-label={T.mix}>
        {rows.map((r, i) => (
          <li key={r.id}>
            <button type="button" className="th-holding" data-dim={dim(i)} {...on(i)} onFocus={() => setHot(i)} onBlur={() => setHot(null)}>
              <span className="th-holding-disc" style={{ "--th-ring": r.color } as CSSProperties}>{marks[i]}</span>
              <span className="th-holding-name">
                <span className="th-holding-sym">{r.symbol}</span>
                <span className="th-holding-sub numbers">{r.sub}</span>
              </span>
              <span className="th-holding-weight">
                <span className="th-holding-pct numbers">{r.pct}</span>
                <span className="th-holding-call numbers">{r.call}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
