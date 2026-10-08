"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/PositionsPanel.tsx (the row, the Unrealized card
// and Close all) — each row's value is what Close pays now (D-197), "≈" while repriced on the display spot between book
// reads; a Window that stopped taking sales says when it pays.
import { ArrowDown, ArrowUp, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { formatBaseUnits } from "@cwf/core/units";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { clockText, livePnlText, money, sideWord } from "../format";
import type { TerminalPosition } from "../terminal-positions";
import { usePositionValue, type PositionValue } from "../usePositionValue";
import { useRowTrail } from "../useTrail";

const noTrail = () => undefined;
const roiText = (bps: number | null) => (bps === null ? "" : ` (${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(1)}%)`);

function PositionRow({ p, current, busy, onClose, onTrailHit, onValue }: { p: TerminalPosition; current: boolean; busy: boolean; onClose: (p: TerminalPosition, v: PositionValue) => void; onTrailHit: (p: TerminalPosition, v: PositionValue, why: "trail") => void; onValue: (id: string, v: PositionValue) => void }) {
  const masked = usePrivacy();
  const v = usePositionValue(p);
  useEffect(() => onValue(p.id, v), [p.id, v, onValue]);
  useRowTrail(p, v, onTrailHit);
  const up = p.side === "up";
  const Dir = up ? ArrowUp : ArrowDown;
  const gain = (v.pnlBase ?? 0n) >= 0n;
  return (
    <div role="listitem" className="tm-pos" aria-current={current ? "true" : undefined}>
      <span className={`tm-pos-side ${up ? "tm-up-soft" : "tm-down-soft"}`}><Dir aria-hidden strokeWidth={3} /></span>
      <span className="tm-pos-main">
        <span className="tm-pos-title">{sideWord(p.side)} {p.asset}</span>
        <span className="tm-pos-meta">
          {formatBaseUnits(p.heldRaw, p.decimals, { minDp: 0, maxDp: 2 })} · {TERMINAL.positions.staked} {masked ? SHELL.masked : money(p.costBase)} · {TERMINAL.positions.settles} {clockText(p.expirySec)}
        </span>
      </span>
      <span className="tm-pos-figure">
        {v.locked ? (
          <span className="tm-pos-meta">{TERMINAL.buttons.locked(clockText(p.expirySec))}</span>
        ) : v.valueBase === null ? (
          "—"
        ) : (
          <>
            <span className="sr-only">{TERMINAL.close.value} </span>
            {v.approx ? `${TERMINAL.close.approx} ` : ""}{masked ? SHELL.masked : money(v.valueBase)}
            <span className={`tm-pos-pnl ${gain ? "is-up" : "is-down"}`}>{masked ? SHELL.masked : `${livePnlText(v.pnlBase ?? 0n)}${roiText(v.roiBps)}`}</span>
          </>
        )}
      </span>
      <button type="button" className="tm-pos-close" onClick={() => onClose(p, v)} disabled={busy || v.locked} aria-label={`${TERMINAL.buttons.close} ${sideWord(p.side)} ${p.asset}`}>
        {busy ? <LoaderCircle aria-hidden className="tm-spin" /> : TERMINAL.buttons.close}
      </button>
    </div>
  );
}

export function PositionsList({ positions, activeMarketId, busyId, onClose, onTrailHit, onValue }: {
  positions: readonly TerminalPosition[];
  activeMarketId: string | null;
  busyId: string | null;
  onClose: (p: TerminalPosition, v: PositionValue) => void;
  /** Wired on one list only (the always-mounted one), so a hit closes once. */
  onTrailHit: ((p: TerminalPosition, v: PositionValue, why: "trail") => void) | null;
  onValue: (id: string, v: PositionValue) => void;
}) {
  if (positions.length === 0) return <p className="tm-empty">{TERMINAL.positions.none}</p>;
  return (
    <div className="tm-card" aria-label={TERMINAL.positions.title} role="list">
      {positions.map((p) => (
        <PositionRow key={p.id} p={p} current={p.marketId === activeMarketId} busy={busyId === p.id} onClose={onClose} onTrailHit={onTrailHit ?? noTrail} onValue={onValue} />
      ))}
    </div>
  );
}

/** Tradash's Unrealized card: the open positions' PnL at what Close pays, and Close all. */
export function UnrealizedCard({ pnlBase, costBase, count, closing, onCloseAll }: { pnlBase: bigint | null; costBase: bigint; count: number; closing: boolean; onCloseAll: () => void }) {
  const masked = usePrivacy();
  if (count === 0) return null;
  const roiBps = pnlBase !== null && costBase > 0n ? Number((pnlBase * 10_000n) / costBase) : null;
  const gain = (pnlBase ?? 0n) >= 0n;
  return (
    <div className="tm-card tm-unrealized">
      <span className="tm-card-title">{TERMINAL.positions.unrealized}</span>
      <span className={`tm-unrealized-figure ${gain ? "is-up" : "is-down"}`}>{pnlBase === null ? "—" : masked ? SHELL.masked : `${livePnlText(pnlBase)}${roiText(roiBps)}`}</span>
      <button type="button" className="tm-choice" onClick={onCloseAll} disabled={closing}>
        {closing ? <LoaderCircle aria-hidden className="tm-spin" /> : TERMINAL.close.all(count)}
      </button>
    </div>
  );
}
