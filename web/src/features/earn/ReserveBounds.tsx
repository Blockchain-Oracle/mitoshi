"use client";
/**
 * §02 on a house reserve (Owarine 90a91d71 `features/earn/ReserveBounds.tsx`; R4-7, D-227 earn spec step 7): the same
 * capital bar the maker's map leads with — Free | what the reserve is holding, with a tick at its exposure cap — Boost's
 * slots as a meter, then the deployed program's own limits as tiles in Owarine's `.vault-cells` grammar (`vault.css`:
 * label over a bold figure, two columns on a phone, three from 640), each note behind an (i), and the one risk line a
 * supplier is owed. Never a projected return.
 */
import type { ReserveSheet } from "@cwf/core";
import type { CSSProperties } from "react";
import { CapitalBar } from "@/components/kit/CapitalBar";
import SectionHead from "@/components/shell/SectionHead";
import { InfoPopover } from "@/components/ui/info-popover";
import type { BoundRow } from "./bounds";
import { EARN } from "./copy";
import { bpsPct, money2 } from "./format";
import type { ReserveWords } from "./reserves";
import "@/components/kit/kit.css";

interface ReserveBoundsProps {
  sheet: ReserveSheet;
  words: ReserveWords;
  rows: readonly BoundRow[];
  /** The reserve's exposure cap as basis points of equity (range, parlay). */
  capBps?: number;
  /** Boost's fixed position slots. */
  slots?: { open: number; max: number };
}

export function ReserveBounds({ sheet, words, rows, capBps, slots }: ReserveBoundsProps) {
  const { bounds, sections, windows } = EARN;
  const usd = (b: bigint) => money2(b, sheet.decimals);
  const slotPct = slots && slots.max > 0 ? Math.min(100, (slots.open / slots.max) * 100) : 0;
  return (
    <section className="ea-map" aria-label={sections.bounds.title}>
      <SectionHead number={sections.bounds.number} title={sections.bounds.title} />
      <div className="ea-map-card">
        <div className="ea-map-figures">
          <span>
            {bounds.free} <span className="numbers ea-map-strong">{usd(sheet.liquidBase)}</span>
          </span>
          <span>
            {words.committed} <span className="numbers ea-map-strong">{usd(sheet.committedBase)}</span>
          </span>
          {capBps !== undefined && capBps > 0 && capBps < 10_000 ? <span className="ea-map-cap numbers">{windows.cap(bpsPct(capBps))}</span> : null}
        </div>
        <CapitalBar
          label={bounds.capitalLabel}
          format={usd}
          capBps={capBps}
          segments={[
            { id: "free", label: bounds.free, valueBase: sheet.liquidBase, color: "var(--ea-idle)" },
            { id: "committed", label: words.committed, valueBase: sheet.committedBase, color: "var(--color-accent)" },
          ]}
        />
        {slots ? (
          <div className="ea-slots">
            <span className="ea-slots-label numbers">{bounds.slots(slots.open, slots.max)}</span>
            <span className="ea-capm ea-slots-meter" aria-hidden data-warn={slotPct >= 90 ? "" : undefined}>
              <span className="ea-capm-fill" style={{ "--ea-share": slotPct } as CSSProperties} />
            </span>
          </div>
        ) : null}
      </div>
      <dl className="ea-cells">
        {rows.map((row) => (
          <div key={row.label} className="ea-cell">
            <dt className="ea-cell-label">
              {row.label}
              <InfoPopover label={bounds.about(row.label)}>{row.note}</InfoPopover>
            </dt>
            <dd className="ea-cell-value numbers">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="ea-risk">{words.risk}</p>
    </section>
  );
}
