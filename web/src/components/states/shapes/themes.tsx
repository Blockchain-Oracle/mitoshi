// The Themes pages' outlines (R6, D-230: "Reading the theme…" was one line of text where a page would be; D-231 on
// baskets). Each is the page's own grid, card rows, chart box and ring at their real sizes, drawn through the states
// kit's `LoadingFrame` by the routes' loading boundaries and static shells — so the read landing moves nothing. A part
// that streams in on its own wears the same bones inside the page (`themeWeekBones`, `themeChartBones`,
// `themeCallsBones`, `themeMixBones`). No data, no client code.
import "@/styles/themes.css";
import "@/styles/themes-detail.css";

const Bar = ({ className }: { className: string }) => <span aria-hidden className={`skel ${className}`} />;

/** A card's week: the figure and its price over the spark. */
export const themeWeekBones = () => (
  <>
    <div className="th-card-figure">
      <Bar className="th-skel-figure" />
      <Bar className="th-skel-micro" />
    </div>
    <Bar className="th-skel-spark" />
  </>
);

function CardBones() {
  return (
    <div className="th-card" aria-hidden>
      <div className="th-card-head">
        <Bar className="th-skel-stack" />
        <div className="th-card-title">
          <Bar className="th-skel-name" />
          <Bar className="th-skel-micro" />
        </div>
        <Bar className="th-skel-pill" />
      </div>
      <Bar className="th-skel-line" />
      <div className="th-card-perf">{themeWeekBones()}</div>
      <Bar className="th-skel-bar" />
      <Bar className="th-skel-line th-skel-short" />
      <div className="th-card-foot">
        <Bar className="th-skel-pill" />
        <Bar className="th-skel-meta" />
      </div>
    </div>
  );
}

/** The catalogue's cards (the head is the page's own, painted at once). */
export const themesGrid = () => (
  <div className="th-grid">
    <CardBones />
    <CardBones />
    <CardBones />
  </div>
);

/** The chart's box: the figure, the plot, the range pill. */
export const themeChartBones = () => (
  <div className="th-chart" aria-hidden>
    <div className="th-chart-head">
      <Bar className="th-skel-micro" />
      <Bar className="th-skel-figure" />
    </div>
    <Bar className="th-skel-chart" />
    <Bar className="th-skel-range" />
  </div>
);

/** The mix: the ring beside its rows. */
export const themeMixBones = () => (
  <div className="th-alloc" aria-hidden>
    <Bar className="th-skel-ring" />
    <div className="th-skel-rows">
      <Bar className="th-skel-row" />
      <Bar className="th-skel-row" />
      <Bar className="th-skel-row" />
    </div>
  </div>
);

/** Rows the size of the calls: a disc and two lines, the side, the result. */
export const themeCallsBones = (rows = 3) => (
  <div className="th-skel-rows" aria-hidden>
    {Array.from({ length: rows }, (_, i) => <Bar key={i} className="th-skel-row" />)}
  </div>
);

function CellBones({ count, keyFacts = false }: { count: number; keyFacts?: boolean }) {
  return (
    <div className={`th-cells${keyFacts ? " th-cells--key" : ""}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="th-cell">
          <Bar className="th-skel-dt" />
          <Bar className="th-skel-dd" />
        </div>
      ))}
    </div>
  );
}

/** One theme, in the page's own grid: the head, the status line, the chart, the mix, the calls; beside them (from
 *  1024 px) the action over the key facts, and the rules; on a phone the action's strip above the dock. */
export const themeDetail = () => (
  <div className="th-page th-detail">
    <div className="th-detail-head">
      <Bar className="th-skel-stack th-skel-stack-lg" />
      <div className="th-detail-title">
        <Bar className="th-skel-name" />
        <Bar className="th-skel-micro" />
      </div>
      <Bar className="th-skel-pill" />
    </div>
    <Bar className="th-skel-plate" />
    <div className="th-detail-grid">
      <div className="th-detail-main">
        <div className="th-section">{themeChartBones()}</div>
        <div className="th-section">
          <Bar className="th-skel-heading" />
          {themeMixBones()}
        </div>
        <div className="th-section">
          <Bar className="th-skel-heading" />
          {themeCallsBones()}
        </div>
      </div>
      <div className="th-detail-side">
        <div className="th-section th-follow-card">
          <div className="th-follow-cta"><Bar className="th-skel-cta" /></div>
          <Bar className="th-skel-line" />
          <CellBones count={4} keyFacts />
        </div>
        <div className="th-section">
          <Bar className="th-skel-heading" />
          <CellBones count={6} />
        </div>
      </div>
    </div>
    <div className="th-dock page-action"><Bar className="th-skel-cta" /></div>
  </div>
);

/** The studio, in its own grid: the title; the wizard's rail, step title, the stocks' panel and Next; from 1024 px the
 *  side panel — the ring, the bar and the preview. */
export const themeStudio = () => (
  <div className="th-page th-studio">
    <Bar className="th-skel-title" />
    <div className="th-studio-grid">
      <div className="th-skel-wizard">
        <Bar className="th-skel-steps" />
        <Bar className="th-skel-step" />
        <div className="th-skel-panel">
          <div className="th-choices">
            {[0, 1, 2, 3, 4, 5].map((i) => <Bar key={i} className="th-skel-choice" />)}
          </div>
        </div>
        <Bar className="th-skel-next" />
      </div>
      <div className="th-side" aria-hidden>
        <Bar className="th-skel-donut" />
        <Bar className="th-skel-bar" />
        <Bar className="th-skel-spark" />
      </div>
    </div>
  </div>
);
