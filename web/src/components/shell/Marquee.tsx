"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/Marquee.tsx (with Agari 03b30ab's honesty: the ticker never
// invents numbers). The ux-audit fixes: copies after the first are `aria-hidden` (they were read three times), text is
// ≥ 11 px at ≥ 4.5:1 (`shell-fixes.css`), and the endless animation stops on coarse pointers and for reduced motion.

export interface MarqueeCell {
  label: string;
  value: string;
  direction?: "up" | "down" | "";
}

/** `cells === null` means no live price has arrived yet: the ticker says so rather than scrolling invented figures. */
export default function Marquee({ cells, waiting }: { cells: readonly MarqueeCell[] | null; waiting: string }) {
  if (!cells || cells.length === 0) {
    return (
      <div className="marquee" role="status">
        <span className="marquee-waiting">{waiting}</span>
      </div>
    );
  }
  const render = (copy: number) =>
    cells.map((cell, i) => (
      <span key={`${copy}-${i}`} className="marquee-cell" aria-hidden={copy > 0 ? true : undefined} data-marquee-copy={copy > 0 ? "" : undefined}>
        <span className="lbl">{cell.label}</span>
        <span className="val numbers">{cell.value}</span>
        {cell.direction ? <span className={cell.direction}>{cell.direction === "up" ? "↑" : "↓"}</span> : null}
      </span>
    ));
  return (
    <div className="marquee" aria-label="Live prices" role="region">
      <div className="marquee-track">
        {render(0)}
        {render(1)}
        {render(2)}
      </div>
    </div>
  );
}
