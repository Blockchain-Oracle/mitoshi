// Ported from Masayume 68f7a09:web/src/components/shell/SectionHead.tsx
interface SectionHeadProps {
  number: string;
  title: string;
  desc?: string;
  count?: number;
  live?: boolean;
  meta?: string;
  cadences?: string[];
}

/**
 * The reference's own `SectionHeader` (`reference/yosuku/components/SectionHeader.tsx`), verbatim:
 * the numbered index, the title row, the description, the right-hand meta. Its `.section-head`
 * rules already live in `yosuku/part-05.css` and `part-06.css`. Named `SectionHead` because the
 * chrome's semantic `SectionHeader` predates it.
 */
export default function SectionHead({ number, title, desc, count, live, meta, cadences }: SectionHeadProps) {
  return (
    <div className="section-head">
      <div className="section-index">
        <span className="section-index-num">{number}</span>
      </div>

      <div className="section-head-mid">
        <div className="section-head-row">
          <h2 className="section-title-2">{title}</h2>
          {live && (
            <span className="live-pill">
              <span className="dot" />
              Live
            </span>
          )}
        </div>
        {desc && <p className="section-desc">{desc}</p>}
      </div>

      <div className="section-head-right">
        {cadences && cadences.length > 0 ? (
          <div className="cadence-chips">
            {cadences.map((c) => (
              <span key={c} className="cadence-chip">
                {c}
              </span>
            ))}
            <span className="cadence-note">rolling</span>
          </div>
        ) : meta ? (
          <span className="section-meta">{meta}</span>
        ) : count !== undefined ? (
          <span className="section-meta">
            {count} market{count !== 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
