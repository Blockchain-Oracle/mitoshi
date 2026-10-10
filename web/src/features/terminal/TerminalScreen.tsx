"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/TerminalScreen.tsx — split per the stage plan
// (`useTerminalState`, `TerminalTrade`, the drawers), on Mitoshi's markets and shell: no demo (D-191), drawers on the
// right edge in the URL (D-190), the shell's rail beside it (D-192). One tree for every width; CSS places it.
import { isStockSymbol, type TickerSymbol } from "@cwf/core";
import { usePathname } from "next/navigation";
import { holdStreamAwake } from "@cwf/markets/stream";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionScope } from "@/components/motion-scope";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { EVERYTHING_DRAWER } from "@/components/shell/Rail";
import { BRAND, CONNECT, SHELL } from "@/lib/copy";
import { notify } from "@/lib/toast";
import { closeDrawer, openDrawer, useDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { usePrivacy } from "@/lib/privacy";
import { useWalletSession } from "@/lib/wallet-session";
import { TapTradingChip, useSessionView } from "@/features/session";
import { useTapArmed } from "@/providers/wallet/tap-session";
import { LiveChart, type ChartHandle } from "./chart/LiveChart";
import { formatPrice, priceDecimals } from "./chart/engine";
import { TERMINAL } from "./copy";
import { clockText, livePnlText, money } from "./format";
import { gap0400NextOpen } from "./pick-window";
import { replaceTradeParams } from "./useTerminalWindow";
import { useMarketSession, type MarketSession } from "@/features/markets/session";
import { useTerminalState } from "./useTerminalState";
import { AssetChip, EquityPill, SettingsStack, ViewPositionPill, WindowChip } from "./ui/Chrome";
import { SessionCell } from "./ui/SessionCell";
import { HaltNotice } from "./ui/HaltNotice";
import { CrowdCell } from "./ui/CrowdCell";
import { EarningsCell } from "./ui/EarningsCell";
import { useLaneNote } from "./lane-note";
import type { TerminalPosition } from "./terminal-positions";
import { useTerminalClose } from "./useTerminalClose";
import { useTrailToggle } from "./useTrail";
import { useWalletToasts } from "./useWalletToasts";
import { trailEligible } from "./position-value";
import type { PositionValue } from "./usePositionValue";
import { PositionsList, UnrealizedCard } from "./ui/PositionsPanel";
import { TradeButtons, trailWords } from "./ui/TradeButtons";
import { TerminalTrade } from "./ui/TerminalTrade";
import { ScheduledTrade } from "./ui/ScheduledTrade";
import { ChartControls } from "./ui/ChartControls";
import { ReactionOverlay } from "./ui/ReactionOverlay";
import { useChartFeedback } from "./useChartFeedback";
import { useReplayRecorder } from "./replay";
import { useAppUpdate } from "./useAppUpdate";
import { setTradeSettings, useTradeSettingsState } from "./settings";
import { Tutorial } from "./ui/Tutorial";
import { AccountDrawer, ExitsDrawer, MarketsDrawer, PositionDetails, SettingsDrawer, useDrawersMounted } from "./lazy-drawers";
import { usePendingFills } from "./fresh-fills";
import { ModeChips, ModePanel, type TerminalMode } from "./ui/ModePanel";
import { useDrawnBand } from "@/features/range/band-store";
import { TICKET_RAIL_MIN_WIDTH } from "@/features/markets/data/useSelection";
import dynamic from "next/dynamic";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";

// The Markets hero's depth view, loaded when first shown (a lazy island).
const HeroDepth = dynamic(() => import("@/features/markets/hero/HeroDepth"), { ssr: false });

export const DRAWERS = { markets: "trade-markets", settings: "trade-settings", positions: "trade-positions", account: "trade-account", history: "trade-history", position: "trade-position", mode: "trade-mode", exits: "trade-exits" } as const;

/** The symbol in the address: a market switch rewrites it in place (no remount), so the path is the source. */
function useSymbol(initial: string): string {
  const path = usePathname();
  const m = /^\/trade\/([A-Z]{2,6})$/.exec(path ?? "");
  return m ? m[1]! : initial;
}

/** `onTourSettled`: the trade settings are read and the tour is open or not (the page drops its `TourCover`). */
export function TerminalScreen({ symbol: initial, onTourSettled, instantTour = false }: { symbol: string; onTourSettled?: () => void; instantTour?: boolean }) {
  const symbol = useSymbol(initial);
  const s = useTerminalState(symbol);
  const session = useWalletSession();
  const masked = usePrivacy();
  const drawer = useDrawerParam();
  const drawersMounted = useDrawersMounted(drawer.open !== null);
  const pendingFills = usePendingFills();
  const tapArmed = useTapArmed();
  const nyse = useMarketSession();
  // The 24/7 lane on screen sits idle across RedStone's 04:00 ET gap (D-185): say why and when it resumes.
  const laneGapNext = s.win.lane ? gap0400NextOpen(s.win.lane.basis, s.win.lane.intervalSec, s.nowSec) : null;
  const sessionView = useSessionView();
  // A paused lane says why on the chip (S6): a corporate action, a halt, no signed source.
  const laneNote = useLaneNote(symbol, s.win.lane);
  // Signed in but neither one-tap path on: every tap would prompt. The card says so and arms in one passkey prompt.
  const needsArm = session.isConnected && !tapArmed && sessionView.status !== "armed";
  const chartHandle = useRef<ChartHandle | null>(null);
  const market = s.market;
  const [pays, setPays] = useState("—");
  const closer = useTerminalClose();
  const [closingAll, setClosingAll] = useState(false);

  // Each row reports what Close pays for it; the totals, the equity and the chart's PnL row read them (D-197).
  const [values, setValues] = useState<ReadonlyMap<string, PositionValue>>(() => new Map());
  const onValue = useCallback((id: string, v: PositionValue) => {
    setValues((prev) => {
      const o = prev.get(id);
      if (o && o.valueBase === v.valueBase && o.pnlBase === v.pnlBase && o.locked === v.locked && o.approx === v.approx && o.exit === v.exit) return prev;
      return new Map(prev).set(id, v);
    });
  }, []);
  const onClose = useCallback((p: TerminalPosition, v: PositionValue) => void closer.close(p, v.exit), [closer]);
  const onTrailHit = useCallback((p: TerminalPosition, v: PositionValue, why: "trail" | "tp" | "sl") => closer.close(p, v.exit, undefined, why), [closer]);
  const toggleTrail = useTrailToggle();
  const [detailId, setDetailId] = useState<string | null>(null);
  const onOpenPosition = useCallback((p: TerminalPosition) => {
    setDetailId(p.id);
    drawer.show(DRAWERS.position);
  }, [drawer]);
  const detail = s.positions.find((p) => p.id === detailId) ?? null;
  const totals = useMemo(() => {
    let value = 0n;
    let pnl = 0n;
    let cost = 0n;
    let priced = 0;
    for (const p of s.positions) {
      const v = values.get(p.id);
      cost += p.costBase;
      if (v?.valueBase == null || v.pnlBase === null) continue;
      value += v.valueBase;
      pnl += v.pnlBase;
      priced += 1;
    }
    return { value, pnl: priced ? pnl : null, cost };
  }, [s.positions, values]);
  const closeAll = async () => {
    setClosingAll(true);
    try {
      for (const p of s.positions) await closer.close(p, values.get(p.id)?.exit ?? null);
    } finally {
      setClosingAll(false);
    }
  };
  const activeValue = s.active ? (values.get(s.active.id) ?? null) : null;
  // The chart's pill carries the open position's PnL; the line turns the down colour while it is losing.
  if (s.active) {
    const base = s.overlay.current ?? { pnl: null, pnlText: "", entry: null, levels: [] };
    const pnlBase = activeValue?.pnlBase ?? null;
    const be = activeValue?.breakEven ?? null;
    const tp = activeValue?.tpSpot ?? null;
    const sl = activeValue?.slSpot ?? null;
    const levels = [
      ...base.levels,
      ...(be === null ? [] : [{ kind: "breakeven" as const, price: be, label: "B/E" }]),
      ...(tp === null ? [] : [{ kind: "tp" as const, price: tp, label: "TP ≈" }]),
      ...(sl === null ? [] : [{ kind: "sl" as const, price: sl, label: "SL ≈" }]),
      ...(activeValue?.koSpot == null ? [] : [{ kind: "knockout" as const, price: activeValue.koSpot, label: "KO ≈" }]),
    ];
    s.overlay.current = { ...base, levels, pnl: pnlBase === null ? null : Number(pnlBase) / 1e6, pnlText: pnlBase === null ? "" : masked ? SHELL.masked : livePnlText(pnlBase) };
  }
  const [depth, setDepth] = useState(false);
  // Up/Down is Tradash's one tap; the other modes host the ticket's own bodies (inline on desktop, a drawer on phones).
  const [mode, setMode] = useState<TerminalMode>("updown");
  const chooseMode = (m: TerminalMode) => {
    setMode(m);
    if (m !== "updown" && !window.matchMedia(`(min-width: ${TICKET_RAIL_MIN_WIDTH}px)`).matches) drawer.show(DRAWERS.mode);
  };
  useAppUpdate();
  useWalletToasts();
  // First visit: the five-step tour, once the browser's settings have loaded with it unseen.
  const settingsState = useTradeSettingsState();
  // In a frame (the landing's phone) the tour never opens: that phone shows the app; the tour belongs to a real visit.
  const tourOpen = settingsState !== null && !settingsState.tutorialSeen && window.self === window.top;
  const settled = settingsState !== null;
  useEffect(() => {
    if (settled) onTourSettled?.();
  }, [settled, onTourSettled]);
  const endTour = (choice: "start" | "later" | "skip") => {
    setTradeSettings({ tutorialSeen: true });
    if (choice === "start" && !session.isConnected) session.connect();
  };
  const fb = useChartFeedback({ symbol, spot: s.spot.price, active: s.active, value: activeValue, linePrice: s.openingRaw === null ? null : Number(s.openingRaw) / 1e8 });
  // Every open position's path is recorded for its replay; the Line is known for the Window on screen.
  const lineOnScreen = s.openingRaw === null ? null : Number(s.openingRaw) / 1e8;
  useReplayRecorder(s.positions, values, (id) => (id === market?.marketId ? lineOnScreen : null));
  // A Range call being composed draws its band on the chart (the Range body publishes it, as for the Markets hero).
  const band = useDrawnBand();
  if (mode === "range" && band && market && band.marketId === market.marketId) {
    const base = s.overlay.current ?? { pnl: null, pnlText: "", entry: null, levels: [] };
    s.overlay.current = { ...base, levels: [...base.levels, { kind: "band", price: Number(band.highE8) / 1e8, label: TERMINAL.modes.bandHigh }, { kind: "band", price: Number(band.lowE8) / 1e8, label: TERMINAL.modes.bandLow }] };
  }
  // An armed trail keeps hearing its price with the tab in the background (it still needs Mitoshi open).
  const trailing = s.positions.some((p) => p.trailStop !== null);
  useEffect(() => (trailing ? holdStreamAwake() : undefined), [trailing]);

  // A `/markets/<id>` link lands here with `?w=`: a Window on another ticker moves the screen there, in place.
  useEffect(() => {
    if (s.win.linkedAsset) window.history.replaceState(null, "", `/trade/${s.win.linkedAsset}${window.location.search}`);
  }, [s.win.linkedAsset]);

  // The account and history drawers need an account: signed out, the link says so instead of opening an empty drawer.
  useEffect(() => {
    if (s.address || (drawer.open !== DRAWERS.account && drawer.open !== DRAWERS.history)) return;
    closeDrawer();
    notify.item({ id: "terminal-signin", title: TERMINAL.toast.signIn, description: TERMINAL.toast.signInBody, action: { label: CONNECT.connect, onClick: session.connect } });
  }, [drawer.open, s.address, session.connect]);

  const pick = (next: TickerSymbol) => {
    // Replacing the drawer's entry closes it and lands on the new market; Back returns to the previous one.
    if (next !== symbol) window.history.replaceState(null, "", `/trade/${next}`);
    else closeDrawer();
  };

  // A stock on RedStone is off NYSE hours (IEX trades carry it 04:00–20:00 ET): §8's "outside NYSE hours" note.
  const source = s.spot.source ?? "redstone";
  const offHours = source === "redstone" && isStockSymbol(symbol) && !s.spot.connecting;
  const feed = offHours ? TERMINAL.feed.redstoneStock : TERMINAL.feed[source];
  const priceText = s.spot.price === null ? "—" : `$${formatPrice(s.spot.price, priceDecimals(s.spot.price))}`;
  const equity = s.cashBase === null ? null : Number(s.cashBase + totals.value) / 1e6;
  const stakeText = s.capped ? `${money(s.stakeBase)} max` : money(s.stakeBase);
  const count = s.positions.length;

  return (
    <MotionScope>
      <div className="tm-screen">
        <section className="tm-stage" aria-label={TERMINAL.chartLabel(s.name, priceText)}>
          <LiveChart symbol={symbol} overlay={s.overlay} onFrame={fb.onFrame} view={s.settings.chartView} interval={s.settings.chartInterval} handle={chartHandle} label={TERMINAL.chartLabel(s.name, priceText)} />
          <ReactionOverlay handle={fb.overlayHandle} />
          {depth && market ? (
            <div className="tm-glass tm-depth">
              <HeroDepth market={market} />
            </div>
          ) : null}
          <div className="tm-controls-slot">
            <ChartControls handle={chartHandle} depthOn={depth} onDepth={setDepth} />
          </div>
          <div className="tm-top">
            <div className="tm-top-row">
              <span className="tm-lead">
                <button type="button" className="tm-glass tm-disc tm-phone" aria-label={BRAND.name} onClick={() => (tapFeedback(), openDrawer(EVERYTHING_DRAWER))}>
                  <MitoshiMark />
                </button>
                <AssetChip asset={symbol} name={s.name} price={s.spot.price} feed={feed} stale={s.spot.stale} connecting={s.spot.connecting} onOpen={() => drawer.show(DRAWERS.markets)} />
              </span>
              <EquityPill className="tm-phone" equity={equity} address={s.address} masked={masked} onOpen={() => drawer.show(DRAWERS.account)} onSignIn={session.connect} />
            </div>
            <div className="tm-window-row">
              {s.win.lanes.length ? (
                <WindowChip lanes={s.win.lanes} laneKey={s.win.lane?.key ?? null} onPick={(l) => replaceTradeParams({ lane: l.key, w: null })} state={s.windowText === TERMINAL.window.none ? (laneNote ?? s.windowText) : s.windowText} />
              ) : s.win.loading ? null : (
                <span className="tm-glass tm-note">{noWindowNote(s.ticker, nyse, s.nowSec)}</span>
              )}
              <SessionCell symbol={symbol} basis={s.win.lane?.basis ?? null} />
              <CrowdCell symbol={symbol} />
              <EarningsCell symbol={symbol} market={market ?? null} />
            </div>
            {laneGapNext !== null ? <span className="tm-glass tm-note">{TERMINAL.noWindow.gap0400(clockText(laneGapNext))}</span> : null}
            {s.win.lane?.basis === "stock24" ? <span className="tm-glass tm-note">{TERMINAL.feed.lane247(symbol)}</span> : offHours ? <span className="tm-glass tm-note">{TERMINAL.feed.offHoursNote}</span> : null}
          </div>
          <div className="tm-stack-slot">
            <SettingsStack asset={symbol} size={stakeText} pays={s.settings.boostX > 1 ? TERMINAL.positions.boost(s.settings.boostX) : market ? pays : "—"} trailing={`${trailWords(s.settings.trailPct)}%`} onOpen={() => drawer.show(DRAWERS.settings)} />
          </div>
        </section>
        <aside className="tm-side" aria-label={TERMINAL.positions.title}>
          <div className="tm-desk tm-end">
            <EquityPill equity={equity} address={s.address} masked={masked} onOpen={() => drawer.show(DRAWERS.account)} onSignIn={session.connect} />
          </div>
          <div className="tm-side-list">
            <UnrealizedCard pnlBase={totals.pnl} costBase={totals.cost} count={count} closing={closingAll} onCloseAll={() => void closeAll()} />
            <PositionsList positions={s.positions} pending={pendingFills} activeMarketId={market?.marketId ?? null} busyId={closer.busy} onClose={onClose} onOpen={onOpenPosition} onTrailHit={onTrailHit} onValue={onValue} />
          </div>
          {count > 0 ? <ViewPositionPill count={count} roiPct={totals.pnl !== null && totals.cost > 0n ? Number((totals.pnl * 10_000n) / totals.cost) / 100 : null} onOpen={() => drawer.show(DRAWERS.positions)} /> : null}
          {needsArm ? (
            <div className="tm-arm" role="note">
              <span className="tm-field-hint">{TERMINAL.arm.lead}</span>
              <TapTradingChip className="tm-choice tm-arm-cta" offLabel={TERMINAL.arm.cta} />
            </div>
          ) : null}
          <HaltNotice symbol={symbol} basis={s.win.lane?.basis ?? null} />
          {market ? <ModeChips mode={mode} onMode={chooseMode} /> : null}
          {mode !== "updown" && market ? (
            <div className="tm-desk"><ModePanel mode={mode} market={market} side={null} /></div>
          ) : s.active ? (
            <TradeButtons
              mode="open"
              trailActive={s.active.trailStop !== null}
              trailEligible={trailEligible(s.active.side, activeValue?.spot ?? null, activeValue?.breakEven ?? null, s.settings.trailPct)}
              trailNote={s.active.trailStop !== null ? TERMINAL.buttons.tabOnly : trailEligible(s.active.side, activeValue?.spot ?? null, activeValue?.breakEven ?? null, s.settings.trailPct) ? null : TERMINAL.buttons.needMove(trailWords(s.settings.trailPct))}
              onTrail={() => toggleTrail(s.active!, activeValue)}
              onClose={() => void closer.close(s.active!, activeValue?.exit ?? null)}
              busy={closer.busy === s.active.id ? "close" : null}
              lockedText={activeValue?.locked ? TERMINAL.buttons.locked(clockText(s.active.expirySec)) : null}
            />
          ) : market && s.phase === "upcoming" ? (
            <ScheduledTrade market={market} stakeBase={s.stakeBase} />
          ) : market ? (
            <TerminalTrade market={market} phase={s.phase} stakeBase={s.stakeBase} spot={s.spot.price} boostX={s.settings.boostX} onPays={setPays} />
          ) : null}
        </aside>
      </div>
      <Tutorial open={tourOpen} onDone={endTour} instant={instantTour} />
      {mode !== "updown" && market ? (
        <SlideOver open={drawer.open === DRAWERS.mode} onOpenChange={(o) => { if (!o) { drawer.close(); setMode("updown"); } }}>
          <SlideOverContent title={TERMINAL.modes.names[mode]}>
            <ModePanel mode={mode} market={market} side={null} />
          </SlideOverContent>
        </SlideOver>
      ) : null}
      {drawersMounted ? (
        <>
          <MarketsDrawer open={drawer.open === DRAWERS.markets} onOpenChange={(o) => !o && drawer.close()} symbol={symbol} set={s.win.set} nowSec={s.nowSec} onPick={pick} />
          <SettingsDrawer open={drawer.open === DRAWERS.settings} onOpenChange={(o) => !o && drawer.close()} stakeBase={s.stakeBase} minBase={s.minBase} maxBase={s.spendableBase} capped={s.capped ? s.capReason : null} />
          {s.address ? (
            <AccountDrawer
              open={drawer.open === DRAWERS.account || drawer.open === DRAWERS.history}
              initialView={drawer.open === DRAWERS.history ? "history" : "menu"}
              onOpenChange={(o) => !o && drawer.close()}
              wallet={s.address}
              equityBase={s.cashBase === null ? null : s.cashBase + totals.value}
              walletBase={s.walletBase}
              unrealizedBase={totals.pnl}
              openCostBase={totals.cost}
              onSettings={() => {
                // The account drawer's entry becomes the settings drawer's: Back still closes it.
                const url = new URL(window.location.href);
                url.searchParams.set("d", DRAWERS.settings);
                window.history.replaceState({ __drawer: DRAWERS.settings }, "", url);
              }}
            />
          ) : null}
          <PositionDetails
            p={detail}
            value={detail ? (values.get(detail.id) ?? null) : null}
            open={drawer.open === DRAWERS.position && detailId !== null}
            onOpenChange={(o) => !o && drawer.close()}
            onReduce={(p, sellRaw) => void closer.close(p, null, undefined, "close", sellRaw)}
            onShow={(p) => window.history.replaceState(null, "", `/trade/${p.asset}?w=${p.marketId}`)}
            onExits={() => {
              // The details drawer's entry becomes the exits drawer's: Back still closes it.
              const url = new URL(window.location.href);
              url.searchParams.set("d", DRAWERS.exits);
              window.history.replaceState({ __drawer: DRAWERS.exits }, "", url);
            }}
            spendableBase={s.spendableBase}
            busy={detail !== null && closer.busy === detail.id}
          />
          <ExitsDrawer p={detail} value={detail ? (values.get(detail.id) ?? null) : null} open={drawer.open === DRAWERS.exits && detailId !== null} onOpenChange={(o) => !o && drawer.close()} />
        </>
      ) : null}
      <SlideOver open={drawer.open === DRAWERS.positions} onOpenChange={(o) => !o && drawer.close()}>
        <SlideOverContent title={TERMINAL.positions.title}>
          <UnrealizedCard pnlBase={totals.pnl} costBase={totals.cost} count={count} closing={closingAll} onCloseAll={() => void closeAll()} />
          <PositionsList positions={s.positions} pending={pendingFills} activeMarketId={market?.marketId ?? null} busyId={closer.busy} onClose={onClose} onOpen={onOpenPosition} onTrailHit={null} onValue={onValue} />
        </SlideOverContent>
      </SlideOver>
    </MotionScope>
  );
}

/** Why a symbol lists no Window right now (the state table, stage-23 "Window rule"). */
function noWindowNote(ticker: { redstoneFeedId: string | null; redstone24x7FeedId: string | null; kind: string } | null, nyse: MarketSession | null, nowSec: number): string {
  if (ticker && !ticker.redstoneFeedId) return TERMINAL.noWindow.spcx;
  const regularHours = nyse?.status.state === "regular" || nyse?.status.state === "early-close";
  const gapNext = ticker?.kind === "stock" && ticker.redstone24x7FeedId && !regularHours ? gap0400NextOpen("stock24", 300, nowSec) : null;
  if (gapNext !== null) return TERMINAL.noWindow.gap0400(clockText(gapNext));
  if (ticker?.kind === "stock" && !ticker.redstone24x7FeedId && !regularHours && nyse?.label) return TERMINAL.noWindow.regularOnly(nyse.label.replace(/^Opens /, ""));
  return TERMINAL.noWindow.none;
}
