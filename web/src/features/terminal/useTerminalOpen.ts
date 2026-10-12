"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/useTerminalTrade.ts (`open`) — on Mitoshi's ticket
// machinery, unchanged: `useQuote` per side, `useTicketRoute` (the Trading Balance's session key when armed and its caps
// cover the call, D-160 words when they don't), `deriveBlocker`, and `usePlaceBet` through `useTapSubmitter`. No demo.
import type { EventMarket, Quote, Side } from "@cwf/core";
import { blockerLabel, diagnosisCopy, formatCadence, type BlockerContext } from "@cwf/core/copy";
import type { MarketPhase } from "@cwf/core/lifecycle";
import { belowMinStake, minStakeBase } from "@cwf/core/sizing";
import { useBalanceSheet, useSigner } from "@cwf/markets/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTopOfBook } from "@/features/markets/data/useTopOfBook";
import { deriveBlocker } from "@/features/markets/ticket/ticket-guards";
import { useLaneGuard } from "@/features/markets/ticket/useLaneGuard";
import { usePlaceBet } from "@/features/markets/ticket/usePlaceBet";
import { useQuote, type QuoteState } from "@/features/markets/ticket/useQuote";
import { useTicketRoute, type TicketRoute } from "@/features/session";
import { useNowMs } from "@/lib/clock";
import { tradeFeedback } from "@/lib/feedback";
import { readRegionPosture } from "@/lib/region-mark";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { TERMINAL } from "./copy";
import { demoState, openPaper } from "./demo";
import { rememberEntry } from "./entries";
import { forgetPending, rememberFill, rememberPending } from "./fresh-fills";
import { centsOf, money, multipleOf, sideWord } from "./format";

export interface SideView {
  quote: QuoteState;
  /** What one tap stakes: the stake, or — the book thinner than it — what the book fills now (Tradash's cap). */
  stakeBase: bigint;
  /** The stake was capped to the book's depth. */
  capped: boolean;
  route: TicketRoute;
  /** What a right call pays per dollar: the live quote's, else the top of the book's (signed out, or before a quote). */
  multiple: number | null;
  /** The first reason this side can't be tapped, in the CTA's words (null: tap away). */
  blocked: string | null;
}

const ENTRY_TOAST = "terminal-open";
/** How long "Tap again to take it" holds the requoted price. */
const REQUOTE_HOLD_MS = 15_000;

export function useTerminalOpen({ market, phase, stakeBase, spot }: { market: EventMarket; phase: MarketPhase | null; stakeBase: bigint; spot: number | null }) {
  const nowMs = useNowMs();
  const session = useWalletSession();
  const { address, hasSigner } = useSigner();
  const sheet = useBalanceSheet(address);
  const walletBase = sheet?.ok ? sheet.value.spendableBase : null;
  // DEMO (D-223): signed out, the buttons quote the live book and a tap books paper at that quote.
  const demo = !session.isConnected && !session.isConnecting;
  const enabled = (hasSigner || demo) && phase === "trading";
  const quoteUp = useQuote({ market, side: "up", stakeBase, nowMs, enabled });
  const quoteDown = useQuote({ market, side: "down", stakeBase, nowMs, enabled });
  const routeUp = useTicketRoute({ market, side: "up", stakeBase, quote: quoteUp.quote, listed: false });
  const routeDown = useTicketRoute({ market, side: "down", stakeBase, quote: quoteDown.quote, listed: false });
  const top = useTopOfBook(market);
  const bet = usePlaceBet(address, { quiet: true });
  const regionHeld = readRegionPosture().markets === "restricted";
  // The session and the lane (S6): a halt, a paused lane or a closed market is named before anything else.
  const guard = useLaneGuard(market);

  const view = (side: Side): SideView => {
    const quote = side === "up" ? quoteUp : quoteDown;
    const route = side === "up" ? routeUp : routeDown;
    const spend = demo ? BigInt(demoState().balanceBase) : route.viaBalance ? route.availableBase : walletBase;
    // A thin book caps the tap at what it fills now (the quote's own fillable stake), unless that is under the minimum.
    const q = quote.quote;
    const capped = q !== null && q.partial && !belowMinStake(q.fillableStakeBase, market.decimals);
    const reading = capped && quote.reading?.ok ? { ...quote.reading, value: { ...q, partial: false } } : quote.reading;
    const blocker = deriveBlocker({
      connected: session.isConnected || demo, connecting: session.isConnecting, rightChain: session.isRightChain || demo, hasSigner: hasSigner || demo, regionHeld, phase,
      placing: bet.placing, side, availableBase: spend, stakeBase, decimals: market.decimals, quote: reading, quoting: quote.pending, quoteStale: quote.stale,
      lane: guard.lane,
    });
    const ctx: BlockerContext = {
      ...guard.ctx,
      cadence: formatCadence(market.intervalSec),
      minStakeText: money(minStakeBase(market.decimals)),
      ...(spend !== null ? { spendableText: money(spend) } : {}),
      ...(quote.quote ? { quotedCents: quote.quote.oddsCents } : {}),
      ...(quote.quote?.partial ? { fillableStakeText: money(quote.quote.fillableStakeBase) } : {}),
    };
    const topCents = side === "up" ? top.upCents : top.downCents;
    const multiple = quote.quote ? 10_000 / quote.quote.avgPriceBps : topCents ? 100 / topCents : null;
    // The region hold reads in the terminal's own words (§8 live guards); the rest are the ticket's D-160 words.
    const label = blocker === "region-restricted" ? TERMINAL.guards.region : blocker ? blockerLabel(blocker, ctx) : null;
    const blocked = blocker && blocker !== "quoting" && blocker !== "placing" ? label : demo ? null : (route.fallback?.reason ?? null);
    return { quote, route, multiple, blocked, stakeBase: capped ? q!.fillableStakeBase : stakeBase, capped };
  };
  const sides = { up: view("up"), down: view("down") };
  const latest = useRef({ sides, spot, session, market });
  latest.current = { sides, spot, session, market };

  const { reset } = bet;
  useEffect(() => reset(), [market.marketId, stakeBase, reset]);

  // The outcome of the last tap, said once: opened (with the cue and the entry line), moved, nothing filled, unknown.
  const outcome = bet.state.outcome;
  const tapped = useRef<{ side: Side; quote: Quote; via: "wallet" | "vault"; market: EventMarket } | null>(null);
  const [lastSide, setLastSide] = useState<Side | null>(null);
  // Confirmed-pending (D-150): once the key has signed and the bytes are sent, the tap is a row ("Confirming on Tempo…")
  // until the receipt says what the engine booked.
  const tx = bet.state.tx;
  useEffect(() => {
    const t = tapped.current;
    if (tx.kind !== "confirmed" || !tx.pending || !t) return;
    rememberPending({ marketId: t.market.marketId, side: t.side, asset: t.market.asset, expirySec: t.market.expirySec, maxCostBase: t.quote.maxCostBase, atMs: Date.now() });
  }, [tx]);
  useEffect(() => {
    const t = tapped.current;
    if (!outcome || !t) return;
    tapped.current = null;
    forgetPending(t.market.marketId, t.side);
    const { spot: s } = latest.current;
    const m = t.market;
    const words = sideWord(t.side);
    if (outcome.status === "confirmed") {
      const b = outcome.booked;
      if (s !== null) rememberEntry(m.marketId, t.side, s);
      // Shown at once from the receipt's own figures, until the positions read has it (`fresh-fills.ts`).
      rememberFill({ marketId: b.marketId, side: b.side, via: t.via, contractsRaw: b.contractsRaw, costBase: b.costBase, atMs: Date.now() });
      tradeFeedback("open", "open");
      return void notify.item({ id: ENTRY_TOAST, title: TERMINAL.toast.opened(words, m.asset), description: TERMINAL.toast.openedBody(multipleOf(b.avgPriceBps / 10), money(b.costBase)) });
    }
    if (outcome.status === "requote") return void notify.item({ id: ENTRY_TOAST, type: "warning", title: TERMINAL.toast.priceMoved, description: TERMINAL.toast.priceMovedBody(centsOf(outcome.quote.avgPriceBps / 10)) });
    // The IOC found the book moved before it filled (a house requote): the same "Price moved — tap again", not a failure.
    if (outcome.status === "refused" && outcome.diagnosis.kind === "requote") return void notify.item({ id: ENTRY_TOAST, type: "warning", title: TERMINAL.toast.priceMoved, description: TERMINAL.toast.tapAgain });
    if (outcome.status === "nothingFilled") return void notify.item({ id: ENTRY_TOAST, title: TERMINAL.toast.nothingFilled, description: TERMINAL.toast.nothingFilledBody });
    if (outcome.status === "unknown") return void notify.item({ id: ENTRY_TOAST, type: "warning", title: TERMINAL.toast.unknown, description: TERMINAL.toast.unknownBody });
    notify.item({ id: ENTRY_TOAST, type: "warning", title: TERMINAL.toast.failed, description: "diagnosis" in outcome ? `${diagnosisCopy(outcome.diagnosis.kind).headline} ${TERMINAL.toast.nothingTaken}` : TERMINAL.toast.nothingTaken });
  }, [outcome]);

  /** One tap: UP or DOWN at the stake, through the ticket's own lane; anything in the way is said, never sent. */
  const open = useCallback(
    (side: Side) => {
      const { sides: v, session: sess, market: m } = latest.current;
      const s = v[side];
      const stake = s.stakeBase;
      if (s.blocked) return void notify.item({ id: ENTRY_TOAST, type: "warning", title: s.blocked });
      if (!sess.isConnected) {
        // DEMO: paper at the live quote — no signature, nothing on chain (Owarine 90a91d71 `useTerminalTrade` demo path).
        const q = s.quote.quote;
        if (!q) return void notify.item({ id: ENTRY_TOAST, title: TERMINAL.toast.gettingPrice, timeout: 2_000 });
        const { spot: at } = latest.current;
        openPaper({
          id: `${m.marketId}:${side}:${Date.now()}`, marketId: m.marketId, asset: m.asset, intervalSec: m.intervalSec, expirySec: m.expirySec, side,
          contractsRaw: q.contractsRaw.toString(), costBase: q.expectedCostBase.toString(), entrySpot: at ?? 0, openedAtMs: Date.now(),
        });
        if (at !== null) rememberEntry(m.marketId, side, at);
        tradeFeedback("open", "open");
        return void notify.item({ id: ENTRY_TOAST, title: TERMINAL.toast.openedDemo(sideWord(side), m.asset), description: TERMINAL.toast.openedBody(multipleOf(q.avgPriceBps / 10), money(q.expectedCostBase)) });
      }
      // "Tap again to take it": the tap right after a requote takes the price the requote showed (D-208), not the
      // button's quote, which may not have re-read the book yet.
      const again = bet.requoted && bet.requoted.side === side && bet.requoted.stakeBase === stake && Date.now() - bet.requoted.quotedAtMs < REQUOTE_HOLD_MS ? bet.requoted : null;
      const quote = again ?? s.quote.quote;
      if (!quote) return void notify.item({ id: ENTRY_TOAST, title: TERMINAL.toast.gettingPrice, timeout: 2_000 });
      const r = s.route.route;
      tapped.current = { side, quote, via: r && r.kind !== "wallet" ? "vault" : "wallet", market: m };
      setLastSide(side);
      notify.item({ id: ENTRY_TOAST, type: "loading", title: TERMINAL.toast.opening(sideWord(side), m.asset) });
      void bet.place({ market: m, side, stakeBase: stake, displayedQuote: quote, route: s.route.route });
    },
    [bet],
  );

  return { sides, open, busy: bet.placing ? lastSide : null };
}

