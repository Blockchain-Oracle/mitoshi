"use client";
// From 21st.dev 30538 ssychui/balance-chart — revamped per D-044 into a theme's performance chart (R6, D-230; D-231 on
// baskets). Kept: the plain-SVG area under a line whose colour follows the trend, the fill fading 0.16 → 0, the high and
// the low floating at their true points instead of a y-axis, labels-only x-axis, the crosshair and dot in HTML over the
// stretched SVG (so the dot stays round), pointer/finger/arrow-key scrub with a readout of the real value, and one pill
// sliding between timeframes (the kit's range control). Changed: the seeded random walk → the basket's weighted mix
// (`mix.ts`, ops' closes, index 100 at the range's start), read as a move in percent; the readout sits in the head, not
// a floating card; the line is the real data (no smoothing pass); a stock without closes draws nothing and says which;
// dates in New York time; tokens for colour; no motion runtime. Refero: Copilot's investments performance card
// (50879a7a-12ba-4b53-a980-5ce6401f6875 — the move as the figure over a full-bleed line, timeframes under it) and
// UGLYCASH's trader profile (c4c2bc7d-01a8-4e47-a349-0f667472460b — the move in the trend colour beside its range).
import { use, useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { THEMES } from "./copy";
import { etDay, etMonth, etStamp, signedPct, toneOf } from "./format";
import { MIX_RANGES, mixMoveBps, moveToBps, type MixRangeId, type MixSeries } from "./mix";
import { SparkPaths, sparkGeometry } from "./spark";
import "@/styles/chart-engine.css";

const T = THEMES.theme;

/** The timeframes: one pill sliding between them — the kit's range control (`chart-range`, chart-engine.css), drawn
 *  here so the page doesn't load the chart engine's motion runtime. */
function Ranges({ value, onChange }: { value: MixRangeId; onChange: (id: MixRangeId) => void }) {
  const index = Math.max(0, MIX_RANGES.findIndex((r) => r.id === value));
  return (
    <div role="tablist" aria-label={T.perf} className="chart-range th-ranges" style={{ "--range-count": MIX_RANGES.length, "--range-index": index } as CSSProperties}>
      <span aria-hidden className="chart-range-thumb" />
      {MIX_RANGES.map((r) => (
        <button key={r.id} type="button" role="tab" aria-selected={r.id === value} onClick={() => onChange(r.id)} className={`chart-range-tab min-h-touch${r.id === value ? " is-active" : ""}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** Left, right or centred on the point, so an extreme near an edge never hangs off the plot. */
const edge = (x: number, w: number) => (x / w <= 0.12 ? { left: 0 } : x / w >= 0.88 ? { right: 0 } : { left: `${(x / w) * 100}%`, transform: "translateX(-50%)" });

export function MixChart({ series, initial = "1w" }: { series: MixSeries; initial?: MixRangeId }) {
  const gradient = useId();
  const [range, setRange] = useState<MixRangeId>(initial);
  const [hover, setHover] = useState<number | null>(null);
  const line = series[range];
  const points = line.points;
  const n = points.length;
  const move = mixMoveBps(points);
  const g = n >= 2 ? sparkGeometry(points) : null;
  const at = hover !== null && n > 0 ? Math.min(hover, n - 1) : null;
  const shown = at !== null ? moveToBps(points, points[at]!) : move;
  const hue = (move ?? 0) < 0 ? "var(--color-down)" : "var(--color-up)";
  const daily = MIX_RANGES.find((r) => r.id === range)!.interval === "1d";
  const ticks = n >= 2 ? [0, 1, 2, 3].map((k) => Math.round((k / 3) * (n - 1))) : [];

  const scrub = (clientX: number, box: DOMRect) => setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - box.left) / box.width) * (n - 1)))));
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const from = at ?? n - 1;
    const next = e.key === "ArrowLeft" ? from - step : e.key === "ArrowRight" ? from + step : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (e.key === "Escape") setHover(null);
    if (next === null || n === 0) return;
    e.preventDefault();
    setHover(Math.max(0, Math.min(n - 1, next)));
  };

  return (
    <div className="th-chart">
      <div className="th-chart-head">
        <span className="th-micro">{`${T.perf} · ${T.ranges[range]}`}</span>
        {g ? (
          <>
            <span className="th-chart-figure numbers" data-tone={toneOf(shown)} aria-live="polite">{shown === null ? "—" : signedPct(shown)}</span>
            <span className="th-chart-when numbers">{at !== null ? etStamp(points[at]!.tMs) : `${etDay(points[0]!.tMs)} – ${etDay(points[n - 1]!.tMs)}`}</span>
          </>
        ) : null}
      </div>
      {g ? (
        <div
          className="th-chart-plot"
          tabIndex={0}
          role="group"
          aria-label={`${T.perf}, ${T.ranges[range]}, ${move === null ? "" : signedPct(move)}. Arrow keys read each close.`}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          onPointerDown={(e) => scrub(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerMove={(e) => scrub(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        >
          <svg viewBox={`0 0 ${g.W} ${g.H}`} preserveAspectRatio="none" className="th-chart-svg" aria-hidden>
            <SparkPaths points={points} hue={hue} id={gradient} fill={0.16} />
          </svg>
          <span className="th-chart-extreme numbers" style={{ ...edge(g.xy[g.iHi]!.x, g.W), top: `${(g.xy[g.iHi]!.y / g.H) * 100}%` }} data-at="high">
            {signedPct(moveToBps(points, points[g.iHi]!) ?? 0)}
          </span>
          <span className="th-chart-extreme numbers" style={{ ...edge(g.xy[g.iLo]!.x, g.W), top: `${(g.xy[g.iLo]!.y / g.H) * 100}%` }} data-at="low">
            {signedPct(moveToBps(points, points[g.iLo]!) ?? 0)}
          </span>
          {at !== null ? (
            <>
              <i aria-hidden className="th-chart-cross" style={{ left: `${(g.xy[at]!.x / g.W) * 100}%` }} />
              <i aria-hidden className="th-chart-dot" style={{ left: `${(g.xy[at]!.x / g.W) * 100}%`, top: `${(g.xy[at]!.y / g.H) * 100}%`, background: hue }} />
            </>
          ) : null}
        </div>
      ) : (
        <p className="th-chart-empty">{line.missing.length > 0 ? T.noChart(line.missing.join(", ")) : T.flat}</p>
      )}
      <div className={`th-chart-axis numbers${g ? "" : " is-empty"}`} aria-hidden>
        {ticks.map((i, k) => <span key={k}>{daily && range === "1y" ? etMonth(points[i]!.tMs) : etDay(points[i]!.tMs)}</span>)}
      </div>
      <div className="th-chart-foot">
        <Ranges value={range} onChange={(id) => (setRange(id), setHover(null))} />
        <p className="th-chart-caveat">{T.caveat}</p>
      </div>
    </div>
  );
}

/** The theme page's chart: the server's mix, streamed in (`use`) under the chart's bones. */
export function Performance({ mix }: { mix: Promise<{ series: MixSeries }> }) {
  return <MixChart series={use(mix).series} />;
}
