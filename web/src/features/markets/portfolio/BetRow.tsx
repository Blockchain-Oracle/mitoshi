"use client";
/**
 * One open bet — Ported from Owarine 90a91d71:web/src/features/markets/portfolio/BetRow.tsx (over Agari 03b30ab's and
 * Masayume 68f7a09's), R4-4 (D-227): live or settling, the Window, its home (Trading Balance, or a Boost's multiple),
 * the countdown, stake → worth now and P&L, and Close. On the terminal's value engine — Staked is the open cost of what
 * is held, Worth now is what Close pays (the exit walk), P&L is the terminal's — and the terminal's one-tap Close for all
 * three homes (`useTerminalClose`: the wallet's SELL, the vault's sell lane, the reserve's close; a requote offers
 * "Close for $X"). A hedge reads "UP + DOWN" with its legs summed. Two lines on a phone (the call and its clock, then
 * the money and Close), Owarine's one line from 640 px. Every amount wears the privacy mask.
 */
import type { Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { countdown } from "@cwf/core/lifecycle";
import { marketDeepLink } from "@cwf/core/urls";
import { Vault } from "lucide-react";
import Link from "next/link";
import { Countdown } from "@/components/data";
import { Masked, PillButton } from "@/components/kit";
import { livePnlText, money } from "@/features/terminal/format";
import { canTrade, isPriced, statusText } from "@/features/terminal/position-return";
import type { TerminalPosition } from "@/features/terminal/terminal-positions";
import type { useTerminalClose } from "@/features/terminal/useTerminalClose";
import type { PositionValue } from "@/features/terminal/usePositionValue";
import { BOOST } from "@/features/boost/copy";
import type { useBoostWrites } from "@/features/boost/useBoostWrites";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { CASH_OUT, HISTORY, PORTFOLIO } from "../copy";
import { AssetDisc } from "../hero/AssetDisc";
import { SIDE_WORD } from "../side-styles";

const sum = (xs: readonly (bigint | null)[]): bigint | null => (xs.some((x) => x === null) ? null : xs.reduce<bigint>((a, x) => a + x!, 0n));

/**
 * Where the row is held, as a tag: the Trading Balance (its pocket's vault mark), or a Boost's multiple. The wallet's own
 * carries none. Under 400 px the word is read aloud only — the mark or "2×" keeps line 1 on one line at 320.
 */
function HomeTag({ p }: { p: TerminalPosition }) {
  if (p.via === "vault") {
    return (
      <span className="bet-tag type-label-micro text-accent">
        <Vault aria-hidden className="size-3" />
        <span className="bet-tag-word">{HISTORY.via.vault}</span>
      </span>
    );
  }
  if (p.via !== "boost" || !p.boost) return null;
  const x = `${(p.boost.leverageBps / 10_000).toFixed(p.boost.leverageBps % 10_000 === 0 ? 0 : 1)}×`;
  return (
    <span className="bet-tag type-label-micro text-accent">
      {x}
      <span className="bet-tag-word">{HISTORY.via.boost}</span>
    </span>
  );
}

export interface BetRowProps {
  legs: readonly TerminalPosition[];
  values: ReadonlyMap<string, PositionValue>;
  closer: ReturnType<typeof useTerminalClose>;
  /** A Boost past its close settles by anyone's crank (the reserve's `settle`): offered on its row. */
  boosts: ReturnType<typeof useBoostWrites>;
}

export function BetRow({ legs, values, closer, boosts }: BetRowProps) {
  const nowMs = useNowMs();
  const p = legs[0]!;
  const state = nowMs > 0 ? countdown(nowMs, p.expirySec, p.intervalSec) : null;
  const settling = state?.settling ?? false;
  const vs = legs.map((l) => values.get(l.id) ?? null);
  const side: Side | null = legs.length === 1 ? p.side : null;
  const label = side ? SIDE_WORD[side] : PORTFOLIO.bothSides;
  const stake = legs.reduce((a, l) => a + l.costBase, 0n);
  const worth = sum(vs.map((v) => v?.valueBase ?? null));
  const pnl = sum(vs.map((v) => (v && isPriced(v.status) ? v.pnlBase : null)));
  // No number: why (locked, no bids, updating), from the first leg without one.
  const unpriced = vs.find((v) => v === null || v.valueBase === null);
  const why = unpriced ? statusText(unpriced.status, p.expirySec, unpriced.fillablePct, unpriced.settled, unpriced.valueBase) : "";
  const v0 = vs[0] ?? null;
  const closable = side !== null && !settling && v0 !== null && canTrade(v0.status);
  const busy = closer.busy === p.id;
  const settleKey = p.boost ? `settle:${p.boost.positionId}` : "";
  const settleBoost = p.boost && nowMs >= p.expirySec * 1000 ? p.boost : null;
  return (
    <li className="bets-row bet-row">
      <span className={cn("bet-status type-label-micro", settling ? "text-ink" : "text-ink-secondary")}>
        {settling ? PORTFOLIO.settling : <><span aria-hidden className="text-accent">●</span> <span className="bet-status-word">{PORTFOLIO.live}</span></>}
      </span>
      <Link href={marketDeepLink({ marketId: p.marketId })} className="bet-call type-body-strong text-ink">
        <AssetDisc asset={p.asset} className="bets-mark" />
        {p.asset} {label}
      </Link>
      <HomeTag p={p} />
      <span className="type-label-micro text-ink-muted">{formatCadence(p.intervalSec)}</span>
      {!settling && (
        <span className="bet-left type-caption text-ink-secondary numbers">
          <Countdown expirySec={p.expirySec} intervalSec={p.intervalSec} nowMs={nowMs} /> <span className="bet-left-word">{PORTFOLIO.left}</span>
        </span>
      )}
      <span className="bets-break" aria-hidden />
      <span className="bet-money type-caption text-ink-secondary">
        <span className="bet-label">{PORTFOLIO.stake} </span>
        <span className="numbers text-ink"><Masked>{money(stake, false, p.decimals)}</Masked></span>
        <span aria-hidden className="bet-arrow">→</span>
        <span className="bet-label">{PORTFOLIO.value} </span>
        <span className="numbers text-ink">{worth === null ? (why || "—") : <Masked>{money(worth, false, p.decimals)}</Masked>}</span>
      </span>
      {pnl === null ? (
        <span className="bet-pnl type-data text-ink-muted">—</span>
      ) : (
        <span className={cn("bet-pnl type-data numbers", pnl > 0n ? "text-up" : pnl < 0n ? "text-down" : "text-ink")}>
          <Masked>{livePnlText(pnl, p.decimals)}</Masked>
        </span>
      )}
      {closable ? (
        <PillButton tone="ghost" size="sm" className="bet-act" disabled={busy} aria-busy={busy} onClick={() => void closer.close(p, v0?.exit ?? null)}>
          {busy ? CASH_OUT.cashingOut : PORTFOLIO.close}
        </PillButton>
      ) : settleBoost ? (
        <PillButton tone="ghost" size="sm" className="bet-act" disabled={boosts.busy === settleKey} aria-busy={boosts.busy === settleKey} onClick={() => void boosts.settle(settleBoost.positionId, p.marketId)}>
          {boosts.busy === settleKey ? BOOST.bets.settling : BOOST.bets.settle}
        </PillButton>
      ) : null}
    </li>
  );
}
