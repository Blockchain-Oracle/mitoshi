"use client";
/**
 * One open bet (Ported from Agari 03b30ab:web/src/features/markets/portfolio/BetRow.tsx, over Masayume 68f7a09's): live
 * or settling, the Window, the countdown, stake, worth now and P&L; before lock a one-sided bet carries the plain
 * cash-out (L-35) that Masayume never connected.
 */
import type { Address, OpenPosition, Side } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { countdown } from "@cwf/core/lifecycle";
import { marketDeepLink } from "@cwf/core/urls";
import Link from "next/link";
import { Countdown, Money } from "@/components/data";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { CASH_OUT, PORTFOLIO } from "../copy";
import { AssetDisc } from "../hero/AssetDisc";
import { SIDE_WORD } from "../side-styles";
import { useCashOut } from "./useCashOut";

export function heldSide(upRaw: bigint, downRaw: bigint): Side | null {
  if (upRaw > 0n && downRaw === 0n) return "up";
  if (downRaw > 0n && upRaw === 0n) return "down";
  return null;
}

/**
 * Cash-out as a hold (21st.dev 23527 hold-to-confirm, S1's `ui/hold-to-confirm`): a tap reads the exit, then the hold
 * names the floor it will accept — selling a position is not a thing to do by a stray tap. Escape or a release cancels.
 */
function CashOut({ position, side, wallet }: { position: OpenPosition; side: Side; wallet: Address }) {
  const held = side === "up" ? position.balanceUpRaw : position.balanceDownRaw;
  const { canSign, busy, note, exit, prepare, cashOut, cancel, money } = useCashOut({ marketId: position.marketId, side, heldRaw: held, decimals: position.decimals }, wallet);
  if (!canSign) return null;
  return (
    <>
      {exit ? (
        <span className="flex basis-full flex-wrap items-center justify-end gap-2" onKeyDown={(e) => e.key === "Escape" && cancel()}>
          <HoldToConfirm onConfirm={() => void cashOut()} confirmLabel={CASH_OUT.cashingOut} disabled={busy}>{CASH_OUT.holdToCashOut(money(exit.minProceedsBase))}</HoldToConfirm>
          <button type="button" className="min-h-touch px-2 type-caption text-ink-secondary underline" onClick={cancel}>{CASH_OUT.keep}</button>
        </span>
      ) : (
        <button type="button" className="min-h-touch type-caption text-accent underline" disabled={busy} aria-busy={busy} onClick={() => void prepare()}>
          {busy ? CASH_OUT.quoting : CASH_OUT.cashOut}
        </button>
      )}
      {note && <span className="basis-full type-caption text-warning sm:text-right" role="status">{note}</span>}
    </>
  );
}

export function BetRow({ position, wallet }: { position: OpenPosition; wallet: Address }) {
  const nowMs = useNowMs();
  const state = nowMs > 0 ? countdown(nowMs, position.expirySec, position.intervalSec) : null;
  const settling = state?.settling ?? false;
  const side = heldSide(position.balanceUpRaw, position.balanceDownRaw);
  const label = side ? SIDE_WORD[side] : PORTFOLIO.bothSides;
  return (
    <li className="bets-row">
      <span className={cn("type-label-micro shrink-0", settling ? "text-ink" : "text-ink-secondary")}>
        {settling ? PORTFOLIO.settling : <><span aria-hidden className="mr-1.5 text-accent">●</span>{PORTFOLIO.live}</>}
      </span>
      <Link href={marketDeepLink({ marketId: position.marketId })} className="inline-flex min-h-touch items-center gap-2 type-body-strong text-ink">
        <AssetDisc asset={position.asset} className="bets-mark" />
        {position.asset} {label}
      </Link>
      <span className="type-label-micro text-ink-muted">{formatCadence(position.intervalSec)}</span>
      {!settling && <span className="type-caption text-ink-secondary"><Countdown expirySec={position.expirySec} intervalSec={position.intervalSec} nowMs={nowMs} /> {PORTFOLIO.left}</span>}
      <span className="bets-break" aria-hidden />
      <span className="flex-1" />
      <span className="type-caption text-ink-secondary">{PORTFOLIO.stake} <Money value={position.costBasisBase} decimals={position.decimals} /></span>
      <span className="type-caption text-ink-secondary">{PORTFOLIO.value} <Money value={position.markValueBase} decimals={position.decimals} /></span>
      <Money value={position.unrealizedPnlBase} decimals={position.decimals} tone="pnl" className="type-data shrink-0" />
      {!settling && side ? <CashOut position={position} side={side} wallet={wallet} /> : null}
    </li>
  );
}
