"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/PositionsPanel.tsx (the row, the Unrealized card
// and Close all) — each row's value is what Close pays now (D-197), "≈" while repriced on the display spot between book
// reads; a Window that stopped taking sales says when it pays.
import { useOpeningPrice } from "@cwf/markets/react";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, CandlestickChart, ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { formatBaseUnits } from "@cwf/core/units";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { clockText, livePnlText, money, sideWord } from "../format";
import type { PendingFill } from "../fresh-fills";
import type { TerminalPosition } from "../terminal-positions";
import { usePositionValue, type PositionValue } from "../usePositionValue";
import { useRowTrail } from "../useTrail";

const noTrail = () => undefined;
const roiText = (bps: number | null) => (bps === null ? "" : ` (${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(1)}%)`);

/**
 * One position, as Owarine 90a91d71's `PositionRow` (P3, D-223): the asset's mark, its side, DEMO when on paper, what
 * it pays or when it settles; ROI and PnL at what Close pays (D-197). A tap opens it in place: the figures, then Close
 * and Manage (Add, Reduce, TP/SL, proof and share in the details drawer).
 */
function PositionRow({ p, current, busy, onClose, onOpen, onTrailHit, onValue }: { p: TerminalPosition; current: boolean; busy: boolean; onClose: (p: TerminalPosition, v: PositionValue) => void; onOpen: (p: TerminalPosition) => void; onTrailHit: (p: TerminalPosition, v: PositionValue, why: "trail" | "tp" | "sl") => void; onValue: (id: string, v: PositionValue) => void }) {
  const masked = usePrivacy();
  const [open, setOpen] = useState(false);
  const v = usePositionValue(p);
  useEffect(() => onValue(p.id, v), [p.id, v, onValue]);
  useRowTrail(p, v, onTrailHit);
  const opening = useOpeningPrice(open ? p.marketId : null);
  const line = opening?.ok && opening.value !== null ? Number(opening.value) / 1e8 : null;
  const up = p.side === "up";
  const Dir = up ? ArrowUpRight : ArrowDownRight;
  const gain = (v.pnlBase ?? 0n) >= 0n;
  const avgCents = p.heldRaw > 0n ? (100 * Number(p.costBase)) / Number(p.heldRaw) : 0;
  const nowCents = v.valueBase !== null && p.heldRaw > 0n ? (100 * Number(v.valueBase)) / Number(p.heldRaw) : null;
  const locked = v.locked || v.settled !== null;
  const sub = v.settled ? (v.settled === "voided" ? TERMINAL.positions.voided : TERMINAL.positions.resolved) : locked ? `${TERMINAL.positions.settles} ${clockText(p.expirySec)}` : `${cadenceOf(p.intervalSec)} · pays ${avgCents > 0 ? (100 / avgCents).toFixed(2) : "—"}×`;
  const hide = (text: string) => (masked ? SHELL.masked : text);
  return (
    <div role="listitem" className="tm-prow" aria-current={current ? "true" : undefined}>
      <button type="button" className="tm-prow-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <AssetDisc asset={p.asset} className="tm-disc tm-prow-disc" />
        <span className="tm-prow-main">
          <span className="tm-prow-title">
            {p.asset}
            <Dir aria-hidden className={up ? "tm-prow-up" : "tm-prow-down"} strokeWidth={2.75} />
            {p.via === "paper" ? <span className="tm-prow-tag">DEMO</span> : null}
            {p.boost ? <span className="tm-prow-tag">{TERMINAL.positions.boost(p.boost.leverageBps / 10_000)}</span> : null}
            {p.trailStop !== null ? <span className="tm-prow-tag">{TERMINAL.buttons.trailing}</span> : null}
          </span>
          <span className="tm-prow-sub">{sub}</span>
        </span>
        <span className="tm-prow-figure">
          {v.roiBps !== null && !locked ? <span className={gain ? "is-up" : "is-down"}>{hide(`${v.roiBps >= 0 ? "+" : "−"}${(Math.abs(v.roiBps) / 100).toFixed(1)}%`)}</span> : <span className="tm-prow-muted">—</span>}
          {v.pnlBase !== null && !locked ? <span className={`tm-prow-pnl ${gain ? "is-up" : "is-down"}`}>{hide(livePnlText(v.pnlBase))}</span> : null}
        </span>
        <ChevronDown aria-hidden className={`tm-prow-chev${open ? " is-open" : ""}`} />
      </button>
      {open ? (
        <div className="tm-prow-body">
          <dl className="tm-prow-grid">
            <dt>Direction</dt><dd className={up ? "tm-prow-up" : "tm-prow-down"}>{up ? "Up" : "Down"} / {cadenceOf(p.intervalSec)}</dd>
            <dt>ROI</dt><dd>{v.roiBps === null ? "—" : hide(`${(v.roiBps / 100).toFixed(2)}%`)}</dd>
            <dt>Avg in</dt><dd>{avgCents.toFixed(1)}¢</dd>
            <dt>Now</dt><dd>{nowCents === null ? "—" : `${nowCents.toFixed(1)}¢`}</dd>
            <dt>Entry</dt><dd>{p.entrySpot ? `$${p.entrySpot.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</dd>
            <dt>Line</dt><dd>{line !== null ? `$${line.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</dd>
            <dt>{TERMINAL.positions.staked}</dt><dd>{hide(money(p.costBase))}</dd>
            <dt>{TERMINAL.positions.settles}</dt><dd>{clockText(p.expirySec)}</dd>
          </dl>
          <div className="tm-prow-actions">
            <button type="button" className="tm-prow-close" onClick={() => onClose(p, v)} disabled={busy || locked} aria-label={`${TERMINAL.buttons.close} ${sideWord(p.side)} ${p.asset}`}>
              {busy ? <LoaderCircle aria-hidden className="tm-spin" /> : TERMINAL.buttons.close}
            </button>
            <button type="button" className="tm-prow-manage" onClick={() => onOpen(p)} aria-haspopup="dialog">{TERMINAL.positions.manage}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const cadenceOf = (sec: number) => (sec % 3600 === 0 ? `${sec / 3600}h` : sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`);

/** A signed tap before its receipt (D-150): the confirmed quote's stake ceiling, no value, nothing to close yet. */
function PendingRow({ f }: { f: PendingFill }) {
  const masked = usePrivacy();
  const up = f.side === "up";
  const Dir = up ? ArrowUp : ArrowDown;
  return (
    <div role="listitem" className="tm-pos" aria-busy="true">
      <span className={`tm-pos-side ${up ? "tm-up-soft" : "tm-down-soft"}`}><Dir aria-hidden strokeWidth={3} /></span>
      <span className="tm-pos-main">
        <span className="tm-pos-title">{sideWord(f.side)} {f.asset}</span>
        <span className="tm-pos-meta">
          <span className="tm-nowrap">{TERMINAL.positions.stakingUpTo(masked ? SHELL.masked : money(f.maxCostBase))}</span> · <span className="tm-nowrap">{TERMINAL.positions.settles} {clockText(f.expirySec)}</span>
        </span>
      </span>
      <span className="tm-pos-figure"><span className="tm-pos-meta">{TERMINAL.positions.confirming}</span></span>
      <span className="tm-pos-close" aria-hidden="true"><LoaderCircle className="tm-spin" /></span>
    </div>
  );
}

export function PositionsList({ positions, pending = [], activeMarketId, busyId, onClose, onOpen, onTrailHit, onValue }: {
  positions: readonly TerminalPosition[];
  /** Signed taps awaiting their receipt, listed first (`fresh-fills.ts`). */
  pending?: readonly PendingFill[];
  activeMarketId: string | null;
  busyId: string | null;
  onClose: (p: TerminalPosition, v: PositionValue) => void;
  onOpen: (p: TerminalPosition) => void;
  /** Wired on one list only (the always-mounted one), so a hit closes once. */
  onTrailHit: ((p: TerminalPosition, v: PositionValue, why: "trail" | "tp" | "sl") => void) | null;
  onValue: (id: string, v: PositionValue) => void;
}) {
  if (positions.length === 0 && pending.length === 0) {
    return (
      <div className="tm-card tm-empty-card">
        <CandlestickChart aria-hidden className="size-10" strokeWidth={1.5} />
        <span>{TERMINAL.positions.none}</span>
      </div>
    );
  }
  return (
    <div className="tm-prow-list" aria-label={TERMINAL.positions.title} role="list">
      {pending.map((f) => (
        <PendingRow key={`pending:${f.marketId}:${f.side}`} f={f} />
      ))}
      {positions.map((p) => (
        <PositionRow key={p.id} p={p} current={p.marketId === activeMarketId} busy={busyId === p.id} onClose={onClose} onOpen={onOpen} onTrailHit={onTrailHit ?? noTrail} onValue={onValue} />
      ))}
    </div>
  );
}

/** Tradash's Unrealized card: the open positions' PnL at what Close pays, and Close all. */
export function UnrealizedCard({ pnlBase, costBase, count, closing, onCloseAll }: { pnlBase: bigint | null; costBase: bigint; count: number; closing: boolean; onCloseAll: () => void }) {
  const masked = usePrivacy();
  const roiBps = pnlBase !== null && costBase > 0n ? Number((pnlBase * 10_000n) / costBase) : null;
  const gain = (pnlBase ?? 0n) >= 0n;
  return (
    <div className="tm-card tm-unrealized">
      <span className="tm-card-title">{TERMINAL.positions.unrealized}</span>
      <span className={`tm-unrealized-figure ${gain ? "is-up" : "is-down"}`}>{count === 0 ? "$0.00" : pnlBase === null ? "—" : masked ? SHELL.masked : `${livePnlText(pnlBase)}${roiText(roiBps)}`}</span>
      {count > 1 ? (
        <button type="button" className="tm-choice" onClick={onCloseAll} disabled={closing}>
          {closing ? <LoaderCircle aria-hidden className="tm-spin" /> : TERMINAL.close.all(count)}
        </button>
      ) : null}
    </div>
  );
}
