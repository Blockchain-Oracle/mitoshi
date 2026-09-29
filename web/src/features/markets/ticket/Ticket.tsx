"use client";
/**
 * The Ticket — Masayume's composer, block for block (Ported from Masayume 68f7a09:web/src/features/markets/ticket/
 * Ticket.tsx, `Ticket624Drawer.tsx` L847–1277): mode · side · the amount block · the three-column strip and its
 * caption · the account gates · the CTA · the footnote. On Tempo one call is one transaction
 * (`[approve(engine, exact), placeOrder(IOC)]`, sponsored): no second signature, no fee line. A Listed Window takes a
 * scheduled call at the user's own price that rests until the bell (Agari 03b30ab ScheduleTicket, D-088). After a fill
 * the body is The Call; "Place another" keeps the stake (D-048).
 */
import type { EventMarket, Quote, Side } from "@cwf/core";
import { belowMinStake, restingQuote } from "@cwf/core";
import { diagnosisCopy, formatCadence, type BlockerContext } from "@cwf/core/copy";
import { minStakeBase } from "@cwf/core/sizing";
import { formatBaseUnits } from "@cwf/core/units";
import { useBalanceSheet, useSeriesGrid, useSigner } from "@cwf/markets/react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TapChip } from "@/features/tap-trading/TapChip";
import { nowMs as clockNow, useNowMs } from "@/lib/clock";
import { readRegionPosture } from "@/lib/region-mark";
import { useWalletSession } from "@/lib/wallet-session";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { CALL, TICKET } from "../copy";
import { CallCard } from "../calls/CallCard";
import { ToWin } from "@/components/ui/prediction-ticket";
import { useTopOfBook } from "../data/useTopOfBook";
import { AmountBlock, BetModes, SideSegments } from "./ComposeBlocks";
import "@/styles/prediction-ticket.css";
import { DEFAULT_PRICE_CENTS, PriceControl } from "./PriceControl";
import { AccountGate, OutcomeNote, ReadoutStrip, TicketCta, type ReadoutCells } from "./StatusBlocks";
import { commonBlocker, deriveBlocker } from "./ticket-guards";
import { usePlaceBet } from "./usePlaceBet";
import { useQuote } from "./useQuote";
import { useTicket } from "./useTicket";

const usd = (b: bigint, decimals: number) => `$${formatBaseUnits(b, decimals, { minDp: 2, maxDp: 2 })}`;

function cellsOf(q: Quote | null, decimals: number): ReadoutCells {
  return q ? { cost: usd(q.expectedCostBase, decimals), ret: usd(q.payoutIfRightBase, decimals), loss: usd(q.maxCostBase, decimals) } : { cost: null, ret: null, loss: null };
}

export interface TicketProps {
  market: EventMarket;
  side: Side | null;
  /** The drawer's own head (below `lg`); the rail sits beside the hero, which already names the Window. */
  head?: ReactNode;
}

export function Ticket({ market, side: urlSide, head }: TicketProps) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const shell = useWalletShell();
  const { address, hasSigner } = useSigner();
  const t = useTicket({ market, side: urlSide, wallet: address, nowMs });
  const { side, stakeBase, phase } = t;
  const decimals = market.decimals;
  const sheet = useBalanceSheet(address);
  const availableBase = sheet?.ok ? sheet.value.spendableBase : null;
  const listed = phase === "upcoming";
  const top = useTopOfBook(market);
  const priceText = (c: number | null) => (c === null ? "—" : `${c}¢`);

  // The taker's quote off the live book; a Listed Window instead sizes the user's own price on the Series grid.
  const quoteState = useQuote({ market, side, stakeBase, nowMs, enabled: hasSigner && phase === "trading" });
  const [priceCents, setPriceCents] = useState(DEFAULT_PRICE_CENTS);
  const grid = useSeriesGrid(listed ? market.seriesId : null);
  const resting = useMemo(
    () => (listed && side && grid?.ok ? restingQuote({ side, priceCents, stakeBase, grid: grid.value, decimals, quotedAtMs: clockNow() }) : null),
    [listed, side, grid, priceCents, stakeBase, decimals],
  );

  const bet = usePlaceBet(address);
  const displayed = listed ? (resting?.ok ? resting.quote : null) : (bet.requoted ?? quoteState.quote);

  // A new stake, side or price starts a new composition; the previous outcome no longer describes it.
  const { reset } = bet;
  useEffect(() => reset(), [stakeBase, side, priceCents, reset]);

  const input = {
    connected: session.isConnected,
    connecting: session.isConnecting,
    rightChain: session.isRightChain,
    hasSigner,
    regionHeld: readRegionPosture().markets === "restricted",
    phase,
    placing: bet.placing,
    side,
    availableBase,
    stakeBase,
    decimals,
    quote: quoteState.reading,
    quoting: quoteState.pending,
    quoteStale: quoteState.stale,
  };
  const blocker = listed ? (commonBlocker(input, { upcoming: true }) ?? (resting?.ok ? null : "quoting")) : deriveBlocker(input);
  const ctx: BlockerContext = {
    cadence: formatCadence(market.intervalSec),
    minStakeText: usd(minStakeBase(decimals), decimals),
    spendableText: availableBase !== null ? usd(availableBase, decimals) : undefined,
    quotedCents: displayed?.oddsCents,
    fillableStakeText: displayed?.partial ? usd(displayed.fillableStakeBase, decimals) : undefined,
  };

  const failed = quoteState.reading && !quoteState.reading.ok ? quoteState.reading.error : null;
  const caption = listed
    ? resting && !resting.ok && resting.blocker === "too-small" ? TICKET.scheduled.tooSmall : TICKET.scheduled.note(new Date(market.tradingStartSec * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))
    : failed
      ? TICKET.quoteFailed(diagnosisCopy(failed.kind).headline)
      : displayed
        ? displayed.partial ? TICKET.partial(usd(displayed.fillableStakeBase, decimals)) : quoteState.stale || quoteState.pending ? TICKET.requoting : TICKET.liveOdds
        : quoteState.pending ? TICKET.gettingQuote : side && stakeBase > 0n && hasSigner && phase === "trading" ? TICKET.noLiquidity : TICKET.enterAmount;

  const place = () => {
    if (!side || !displayed) return;
    void bet.place({ market, side, stakeBase, displayedQuote: displayed, route: { kind: "wallet" } }, { resting: listed });
  };
  const signer = shell.walletKey ? "access-key" : session.kind === "passkey" ? "passkey" : "injected";
  const booked = bet.state.outcome?.status === "confirmed" ? bet.state.outcome.booked : null;
  const scheduled = listed && bet.state.outcome?.status === "nothingFilled" ? bet.state.outcome : null;

  const another = () => bet.reset();

  return (
    <section aria-label={TICKET.title} className="tk-ticket flex flex-col gap-3">
      {head}
      {booked || scheduled ? (
        <CallCard
          card={{
            asset: market.asset, side: booked?.side ?? side ?? "up", lineRaw: t.openingRaw, stakeBase: booked?.costBase ?? displayed?.maxCostBase ?? 0n, contractsRaw: booked?.contractsRaw ?? displayed?.contractsRaw ?? 0n, decimals,
            tradingStartSec: market.tradingStartSec, expirySec: market.expirySec, txHash: booked?.txHash ?? scheduled!.txHash, placedAtMs: Date.now(), resting: !booked,
          }}
          actions={
            <div className="call-actions">
              <Link href="/portfolio">{CALL.portfolio}</Link>
              <button type="button" onClick={another}>{CALL.another}</button>
            </div>
          }
        />
      ) : (
        <>
          <BetModes />
          <SideSegments side={side} onSelect={t.selectSide} prices={{ up: priceText(top.upCents), down: priceText(top.downCents) }} />
          {listed ? <PriceControl priceCents={priceCents} onChange={setPriceCents} side={side} /> : null}
          <AmountBlock value={t.stakeText} onChange={t.setStakeText} stakeBase={stakeBase} onStakeBase={t.setStakeBase} balanceBase={availableBase} decimals={decimals} belowMin={stakeBase > 0n && belowMinStake(stakeBase, decimals)} remembered={t.remembered} costBase={displayed?.expectedCostBase ?? null} />
          <ReadoutStrip cells={cellsOf(displayed, decimals)} live={displayed !== null} caption={caption} chance={displayed ? TICKET.chance(Math.round(displayed.avgPriceBps / 100)) : null} />
          <AccountGate connected={session.isConnected} onSignIn={session.connect} availableBase={availableBase} stakeBase={stakeBase} decimals={decimals} chip={<TapChip />} />
          {t.advancedFrom ? <p role="status" className="type-caption text-ink-secondary">{TICKET.advanced(formatCadence(t.advancedFrom.intervalSec), formatCadence(market.intervalSec))}</p> : null}
          <OutcomeNote tx={bet.state.tx} outcome={bet.state.outcome} decimals={decimals} onDismiss={bet.reset} />
          <div className="tk-cta-dock">
            <ToWin label={TICKET.toWin} amount={displayed ? formatBaseUnits(displayed.payoutIfRightBase, decimals, { group: false, minDp: 2, maxDp: 2 }) : null} note={displayed ? TICKET.avgPrice(Math.round(displayed.avgPriceBps / 100)) : null} />
            <TicketCta blocker={blocker} ctx={ctx} tx={bet.state.tx} side={side} costBase={displayed?.maxCostBase ?? null} decimals={decimals} signer={signer} onConfirm={place} action={listed ? TICKET.scheduled.cta : TICKET.buy} />
            <p className="tk-foot">{shell.walletKey ? TICKET.footnoteArmed : session.kind === "passkey" ? TICKET.footnotePasskey : TICKET.footnote}</p>
          </div>
        </>
      )}
    </section>
  );
}
