"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/PositionsPanel.tsx (the row, the Unrealized card
// and Close all) — each row's value is what Close pays now (D-197), "≈" while repriced on the display spot between book
// reads; a Window that stopped taking sales says when it pays. R4-1 (D-227, Owarine 90a91d71 `PositionRow`,
// `UnrealizedCard`): every row says why it has its number or none (`position-return.ts`) — a lock, no bids, "N%
// sellable" on a thin book, "Updating" while the cost indexes — ROI and P&L roll on the Odometer, Now is the walk's own
// price a contract, a Boost pays (held − fronted) ÷ its stake, and the Unrealized total counts priced rows only.
import { useOpeningPrice } from "@cwf/markets/react";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, CandlestickChart, ChevronDown, LoaderCircle, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Odometer } from "@/components/kit";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { SHELL } from "@/lib/copy";
import { usePrivacy } from "@/lib/privacy";
import { TERMINAL } from "../copy";
import { centsOf, clockText, money, moneyDecimals, sideWord, USD_DECIMALS } from "../format";
import type { PendingFill } from "../fresh-fills";
import { statusText } from "../position-return";
import { avgTicksOf, paysMultiple } from "../position-value";
import { roiBpsOf, type PositionsTotals } from "../positions-totals";
import type { TerminalPosition } from "../terminal-positions";
import { usePositionValue, type PositionValue } from "../usePositionValue";
import { ParlayRow, RangeRow } from "../parlay/BetRows";
import type { useTerminalBets } from "../parlay/useTerminalBets";
import type { Valued } from "../positions-totals";
import { useRowTrail } from "../useTrail";

const noTrail = () => undefined;
const dollars = (base: bigint, decimals: number) => Number(base) / 10 ** decimals;

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
  const avg = avgTicksOf(p);
  const pays = paysMultiple(p);
  const shut = v.status === "locked" || v.status === "settling";
  const note = statusText(v.status, p.expirySec, v.fillablePct, v.settled, v.valueBase);
  const sub = `${cadenceOf(p.intervalSec)} · pays ${pays === null ? "—" : `${pays.toFixed(2)}×`}`;
  const hide = (text: string) => (masked ? SHELL.masked : text);
  return (
    <div role="listitem" className="tm-prow" aria-current={current ? "true" : undefined} data-status={v.status}>
      <button type="button" className="tm-prow-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <AssetDisc asset={p.asset} className="tm-disc tm-prow-disc" />
        <span className="tm-prow-main">
          <span className="tm-prow-title">
            {p.asset}
            <Dir aria-hidden className={up ? "tm-prow-up" : "tm-prow-down"} strokeWidth={2.75} />
            {p.via === "paper" ? <span className="tm-prow-tag">DEMO</span> : null}
            {p.via === "vault" ? <span className="tm-prow-tag">{TERMINAL.positions.balanceTag}</span> : null}
            {p.boost ? <span className="tm-prow-tag">{TERMINAL.positions.boost(p.boost.leverageBps / 10_000)}</span> : null}
            {p.trailStop !== null ? <span className="tm-prow-tag">{TERMINAL.buttons.trailing}</span> : null}
          </span>
          <span className="tm-prow-sub">{sub}</span>
          {note ? <span className="tm-prow-sub tm-prow-status">{note}</span> : null}
        </span>
        <span className="tm-prow-figure">
          {masked && v.roiBps !== null ? <span className="tm-prow-muted">{SHELL.masked}</span> : v.roiBps !== null ? <Odometer kind="pct" value={v.roiBps / 100} decimals={1} /> : shut ? <Lock aria-label={note} className="tm-prow-lock" /> : <span className="tm-prow-muted">—</span>}
          {v.pnlBase !== null && !masked ? <Odometer kind="pnl" value={dollars(v.pnlBase, p.decimals)} decimals={moneyDecimals(dollars(v.pnlBase, p.decimals))} className="tm-prow-pnl" /> : null}
        </span>
        <ChevronDown aria-hidden className={`tm-prow-chev${open ? " is-open" : ""}`} />
      </button>
      {open ? (
        <div className="tm-prow-body">
          <dl className="tm-prow-grid">
            <dt>Direction</dt><dd className={up ? "tm-prow-up" : "tm-prow-down"}>{up ? "Up" : "Down"} / {cadenceOf(p.intervalSec)}</dd>
            <dt>ROI</dt><dd>{v.roiBps === null ? "—" : hide(`${(v.roiBps / 100).toFixed(2)}%`)}</dd>
            <dt>Avg in</dt><dd>{avg === null ? "—" : centsOf(avg)}</dd>
            <dt>Now</dt><dd>{v.nowTicks === null ? "—" : `${v.approx ? "≈ " : ""}${centsOf(v.nowTicks)}`}</dd>
            <dt>Entry</dt><dd>{p.entrySpot ? `$${p.entrySpot.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</dd>
            <dt>Line</dt><dd>{line !== null ? `$${line.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</dd>
            <dt>{TERMINAL.positions.staked}</dt><dd>{hide(money(p.costBase, false, p.decimals))}</dd>
            <dt>{TERMINAL.positions.settles}</dt><dd>{clockText(p.expirySec)}</dd>
          </dl>
          <div className="tm-prow-actions">
            <button type="button" className="tm-prow-close" onClick={() => onClose(p, v)} disabled={busy || shut || v.status === "settled"} aria-label={`${TERMINAL.buttons.close} ${sideWord(p.side)} ${p.asset}`}>
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

export function PositionsList({ positions, bets, pending = [], activeMarketId, busyId, onClose, onOpen, onTrailHit, onValue, onBetValue }: {
  positions: readonly TerminalPosition[];
  /** Open parlays and Range rounds, at fair value (D-227): listed first, in the totals, never in Close all. */
  bets?: Pick<ReturnType<typeof useTerminalBets>, "parlays" | "ranges">;
  onBetValue?: (id: string, v: Valued) => void;
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
  const parlays = bets?.parlays ?? [];
  const ranges = bets?.ranges ?? [];
  if (positions.length === 0 && pending.length === 0 && parlays.length + ranges.length === 0) {
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
      {onBetValue ? parlays.map((t) => <ParlayRow key={`parlay:${t.parlayId}`} t={t} onValue={onBetValue} />) : null}
      {onBetValue ? ranges.map((r) => <RangeRow key={`range:${r.roundId}`} r={r} onValue={onBetValue} />) : null}
      {positions.map((p) => (
        <PositionRow key={p.id} p={p} current={p.marketId === activeMarketId} busy={busyId === p.id} onClose={onClose} onOpen={onOpen} onTrailHit={onTrailHit ?? noTrail} onValue={onValue} />
      ))}
    </div>
  );
}

/**
 * Tradash's Unrealized card (Owarine 90a91d71 `UnrealizedCard`): the priced rows' P&L at what Close pays, its % of what
 * they cost, "· N unpriced" beside it, or "—" with why when none is priced; Close all past one position.
 */
export function UnrealizedCard({ totals, count, closable = count, closing, onCloseAll }: { totals: PositionsTotals; count: number; closable?: number; closing: boolean; onCloseAll: () => void }) {
  const masked = usePrivacy();
  const roiBps = roiBpsOf(totals.pnlBase, totals.costBase);
  const pnl = totals.pnlBase === null ? 0 : dollars(totals.pnlBase, USD_DECIMALS);
  const none = count > 0 && totals.pnlBase === null;
  return (
    <div className="tm-card tm-unrealized">
      <span className="tm-card-title">{TERMINAL.positions.unrealized}</span>
      <span className="tm-unrealized-figure">
        {count === 0 ? "$0.00" : none ? "—" : masked ? SHELL.masked : <Odometer kind="pnl" value={pnl} decimals={moneyDecimals(pnl)} zeroIsUp />}
      </span>
      {closable > 1 ? (
        <button type="button" className="tm-choice" onClick={onCloseAll} disabled={closing}>
          {closing ? <LoaderCircle aria-hidden className="tm-spin" /> : TERMINAL.close.all(closable)}
        </button>
      ) : null}
      {none ? (
        <span className="tm-unrealized-sub">{TERMINAL.positions.allUnpriced}</span>
      ) : count > 0 && !masked ? (
        <span className="tm-unrealized-sub">
          {roiBps !== null ? <Odometer kind="pct" value={roiBps / 100} decimals={2} /> : null}
          {totals.unpriced > 0 ? <span>{TERMINAL.positions.unpriced(totals.unpriced)}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
