"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/PositionsPanel.tsx (the row and the empty state) —
// 23c lists what is held; the live value, ROI, Close and Add/Reduce arrive with 23d's exit read (D-197).
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatBaseUnits } from "@cwf/core/units";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { clockText, money, sideWord } from "../format";
import type { TerminalPosition } from "../terminal-positions";

export function PositionsList({ positions, activeMarketId }: { positions: readonly TerminalPosition[]; activeMarketId: string | null }) {
  const masked = usePrivacy();
  if (positions.length === 0) return <p className="tm-empty">{TERMINAL.positions.none}</p>;
  return (
    <div className="tm-card" aria-label={TERMINAL.positions.title} role="list">
      {positions.map((p) => {
        const up = p.side === "up";
        const Dir = up ? ArrowUp : ArrowDown;
        return (
          <div key={p.id} role="listitem" className="tm-pos" aria-current={p.marketId === activeMarketId ? "true" : undefined}>
            <span className={`tm-pos-side ${up ? "tm-up-soft" : "tm-down-soft"}`}><Dir aria-hidden strokeWidth={3} /></span>
            <span className="tm-pos-main">
              <span className="tm-pos-title">{sideWord(p.side)} {p.asset}</span>
              <span className="tm-pos-meta">
                {formatBaseUnits(p.heldRaw, p.decimals, { minDp: 0, maxDp: 2 })} · {TERMINAL.positions.settles} {clockText(p.expirySec)}
              </span>
            </span>
            <span className="tm-pos-figure">
              <span className="sr-only">{TERMINAL.positions.staked} </span>
              {masked ? SHELL.masked : money(p.costBase)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
