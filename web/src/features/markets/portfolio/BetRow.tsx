"use client";
/**
 * One open bet (Ported from Agari 03b30ab:web/src/features/markets/portfolio/BetRow.tsx, over Masayume 68f7a09's): live
 * or settling, the Window, the countdown, stake, worth now and P&L; before lock a one-sided bet carries the plain
 * cash-out (L-35) that Masayume never connected. D-227: on the terminal's value engine — Staked is the open cost of what
 * is held, Worth now is what Close pays (the exit walk, not the last trade), P&L is the terminal's; a Trading Balance
 * bet is tagged "Balance" and closes on its own lane; a hedge reads "UP + DOWN" with its legs summed.
 */
import type { Address, Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { countdown } from "@cwf/core/lifecycle";
import { marketDeepLink } from "@cwf/core/urls";
import Link from "next/link";
import { Countdown, Money } from "@/components/data";
import { TERMINAL } from "@/features/terminal/copy";
import { isPriced, statusText } from "@/features/terminal/position-return";
import type { TerminalPosition } from "@/features/terminal/terminal-positions";
import type { useTerminalClose } from "@/features/terminal/useTerminalClose";
import type { PositionValue } from "@/features/terminal/usePositionValue";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { CASH_OUT, PORTFOLIO } from "../copy";
import { AssetDisc } from "../hero/AssetDisc";
import { SIDE_WORD } from "../side-styles";
import { useCashOut } from "./useCashOut";

/**
 * Cash-out in one tap, as the terminal's CLOSE (D-197): the tap reads the exit and sells at its floor less the close
 * tolerance; a requote past the tolerance becomes "Close for $X" at the fresh floor.
 */
function CashOut({ p, wallet }: { p: TerminalPosition; wallet: Address }) {
  const { canSign, busy, note, retry, close, money } = useCashOut({ marketId: p.marketId, side: p.side, heldRaw: p.heldRaw, decimals: p.decimals }, wallet);
  if (!canSign) return null;
  return (
    <>
      <button type="button" className="min-h-touch type-caption text-accent underline" disabled={busy} aria-busy={busy} onClick={() => void close(retry ?? undefined)}>
        {busy ? CASH_OUT.cashingOut : retry ? CASH_OUT.closeFor(money(retry.minProceedsBase)) : CASH_OUT.cashOut}
      </button>
      {note && <span className="basis-full type-caption text-warning sm:text-right" role="status">{note}</span>}
    </>
  );
}

/** A Trading Balance bet closes on the vault's sell lane (the terminal's Close: the session key when armed). */
function BalanceCashOut({ p, v, closer }: { p: TerminalPosition; v: PositionValue | null; closer: ReturnType<typeof useTerminalClose> }) {
  const busy = closer.busy === p.id;
  return (
    <button type="button" className="min-h-touch type-caption text-accent underline" disabled={busy} aria-busy={busy} onClick={() => void closer.close(p, v?.exit ?? null)}>
      {busy ? CASH_OUT.cashingOut : CASH_OUT.cashOut}
    </button>
  );
}

const sum = (xs: readonly (bigint | null)[]): bigint | null => (xs.some((x) => x === null) ? null : xs.reduce<bigint>((a, x) => a + x!, 0n));

/** `readOnly` (someone else's profile, R4-10): the row without its cash-out — only the holder can close it. */
export function BetRow({ legs, values, wallet, closer, readOnly = false }: { legs: readonly TerminalPosition[]; values: ReadonlyMap<string, PositionValue>; wallet: Address; closer?: ReturnType<typeof useTerminalClose>; readOnly?: boolean }) {
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
  return (
    <li className="bets-row">
      <span className={cn("type-label-micro shrink-0", settling ? "text-ink" : "text-ink-secondary")}>
        {settling ? PORTFOLIO.settling : <><span aria-hidden className="mr-1.5 text-accent">●</span>{PORTFOLIO.live}</>}
      </span>
      <Link href={marketDeepLink({ marketId: p.marketId })} className="inline-flex min-h-touch items-center gap-2 type-body-strong text-ink">
        <AssetDisc asset={p.asset} className="bets-mark" />
        {p.asset} {label}
      </Link>
      <span className="type-label-micro text-ink-muted">{formatCadence(p.intervalSec)}{p.via === "vault" ? ` · ${TERMINAL.positions.balanceTag}` : ""}</span>
      {!settling && <span className="type-caption text-ink-secondary"><Countdown expirySec={p.expirySec} intervalSec={p.intervalSec} nowMs={nowMs} /> {PORTFOLIO.left}</span>}
      <span className="bets-break" aria-hidden />
      <span className="flex-1" />
      <span className="type-caption text-ink-secondary">{PORTFOLIO.stake} <Money value={stake} decimals={p.decimals} /></span>
      <span className="type-caption text-ink-secondary">{PORTFOLIO.value} {worth === null ? (why || "—") : <Money value={worth} decimals={p.decimals} />}</span>
      {pnl === null ? <span className="type-data shrink-0 text-ink-muted">—</span> : <Money value={pnl} decimals={p.decimals} tone="pnl" className="type-data shrink-0" />}
      {readOnly || settling || !side ? null : p.via === "vault" ? closer ? <BalanceCashOut p={p} v={vs[0] ?? null} closer={closer} /> : null : <CashOut p={p} wallet={wallet} />}
    </li>
  );
}
