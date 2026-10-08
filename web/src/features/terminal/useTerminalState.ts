"use client";
// The terminal's state outside the trade buttons (S23c): the Window and its phase, the live and signed prices, money,
// the stake, positions, and the chart's overlay. Split from `TerminalScreen` (files ≤ 400 lines).
import { isTickerSymbol, TICKERS, type EventMarket } from "@cwf/core";
import { noEntryCutoffSec } from "@cwf/core/lifecycle";
import { minStakeBase } from "@cwf/core/sizing";
import { useBalanceSheet, useKeyRemaining, useSigner } from "@cwf/markets/react";
import { useEffect, useMemo, useRef } from "react";
import { useSpot } from "@/features/markets/data/useChartSeries";
import { useWindowPhase } from "@/features/markets/data/useWindowPhase";
import { useSessionView } from "@/features/session";
import { useNowMs } from "@/lib/clock";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { useTapArmed } from "@/providers/wallet/tap-session";
import { readWalletKey } from "@/providers/wallet/wallet-key-store";
import type { ChartLevel, ChartOverlay } from "./chart/LiveChart";
import { TERMINAL } from "./copy";
import { untilText, USD_DECIMALS } from "./format";
import { useCommittedSpot } from "./live";
import { TRADE_COOKIE } from "./route";
import { useTradeSettings, wantedStakeBase } from "./settings";
import { useTerminalPositions } from "./terminal-positions";
import { useTerminalWindow } from "./useTerminalWindow";

const COOKIE_MAX_AGE_SEC = 365 * 86_400;

/** The Window chip's words for the Window on screen. */
export function windowStateText(market: EventMarket | null, phase: string | null, nowSec: number): string {
  if (!market || !phase) return TERMINAL.window.none;
  switch (phase) {
    case "upcoming":
      return TERMINAL.window.opens(untilText(market.tradingStartSec, nowSec));
    case "pendingOpeningPrint":
      return TERMINAL.window.pricing;
    case "trading":
      return TERMINAL.window.trades(untilText(noEntryCutoffSec(market), nowSec));
    case "noEntryBuffer":
      return TERMINAL.window.closes(untilText(market.expirySec, nowSec));
    default:
      return TERMINAL.window.settling;
  }
}

const e8 = (raw: bigint | null) => (raw === null ? null : Number(raw) / 1e8);

export function useTerminalState(symbol: string) {
  const nowMs = useNowMs();
  const nowSec = Math.floor(nowMs / 1000);
  const settings = useTradeSettings();
  const ticker = isTickerSymbol(symbol) ? TICKERS[symbol] : null;
  const name = ticker?.name ?? symbol;
  const win = useTerminalWindow(symbol);
  const market = win.market;
  const { phase, openingRaw } = useWindowPhase(market, nowMs);
  const spot = useCommittedSpot(symbol);
  const signedE8 = useSpot(market);

  // Money: the wallet's pathUSD and, armed, the Trading Balance's headroom (what one tap may spend either way).
  const { address } = useSigner();
  const sheet = useBalanceSheet(address);
  const walletBase = sheet?.ok ? sheet.value.spendableBase : null;
  const view = useSessionView();
  const balanceBase = view.status === "armed" ? view.availableBase : null;
  // The wallet's one-tap key signs within its daily limit: a stake over what it may still spend is capped before
  // signing, not refused by the chain ("Over your tap-trading limit").
  const tapArmed = useTapArmed();
  const walletKey = tapArmed && address ? readWalletKey(TEMPO_CHAIN_ID, address) : null;
  const keyLeft = useKeyRemaining(address, walletKey?.keyId ?? null);
  const keyRemainingBase = keyLeft?.ok ? keyLeft.value.remaining : null;
  const walletTapBase = walletBase !== null && keyRemainingBase !== null && keyRemainingBase < walletBase ? keyRemainingBase : walletBase;
  const spendableBase = balanceBase ?? walletTapBase;
  const capReason: "balance" | "key" | "budget" | null = balanceBase !== null ? "budget" : walletTapBase !== walletBase ? "key" : "balance";
  const minBase = minStakeBase(market?.decimals ?? USD_DECIMALS);
  const wanted = wantedStakeBase(settings, spendableBase, minBase);
  const capped = spendableBase !== null && spendableBase >= minBase && wanted > spendableBase;
  const stakeBase = capped ? spendableBase! : wanted;
  const cashBase = walletBase === null && view.availableBase === null ? null : (walletBase ?? 0n) + (view.deployed ? (view.availableBase ?? 0n) : 0n);

  const positions = useTerminalPositions(address, win.set);
  const active = positions.find((p) => p.marketId === market?.marketId) ?? null;

  // The chart's overlay: the Line, the newest signed value, and the Entry of a position on this Window. Written to a
  // ref the chart reads every frame (no re-render per tick).
  const overlay = useRef<ChartOverlay | null>(null);
  const levels = useMemo(() => {
    const out: ChartLevel[] = [];
    const line = e8(openingRaw);
    if (line !== null) out.push({ kind: "line", price: line, label: "Line" });
    const signed = e8(signedE8);
    if (signed !== null) out.push({ kind: "signed", price: signed, label: "Signed" });
    if (active?.entrySpot) out.push({ kind: "entry", price: active.entrySpot, label: "Entry" });
    if (active?.trailStop) out.push({ kind: "trail", price: active.trailStop, label: "Trail" });
    return out;
  }, [openingRaw, signedE8, active]);
  overlay.current = levels.length ? { pnl: null, pnlText: "", entry: active?.entrySpot ?? null, levels } : null;

  // The address and the tab say which market; the cookie brings `/trade` back here next time.
  useEffect(() => {
    document.title = TERMINAL.title(name, symbol);
    try {
      document.cookie = `${TRADE_COOKIE}=${symbol}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; samesite=lax`;
    } catch {
      // cookies blocked: `/trade` opens BTC
    }
  }, [name, symbol]);

  return {
    nowSec, settings, name, ticker, win, market, phase, openingRaw, spot, signedE8, address,
    walletBase, cashBase, spendableBase, minBase, stakeBase, capped, capReason, positions, active, overlay,
    windowText: windowStateText(market, phase, nowSec),
  };
}

export type TerminalState = ReturnType<typeof useTerminalState>;
