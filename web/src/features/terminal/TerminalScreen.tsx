"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/TerminalScreen.tsx — split per the stage plan
// (`useTerminalState`, `TerminalTrade`, the drawers), on Mitoshi's markets and shell: no demo (D-191), drawers on the
// right edge in the URL (D-190), the shell's rail beside it (D-192). One tree for every width; CSS places it. R4-0
// (D-227): the phone dock stays under it (the mark disc left the header), the stack sits under the chart controls and
// hides while the interval menu is open, UP/DOWN stay with the reason when no Window is listed, and signed-out History
// is DEMO's paper history. R4-1 (D-227): the book of positions is `useTerminalBook` — totals over priced rows, equity
// with every row at what it counts for, the Window's positions summed on the chart. R4-3 (D-227), Owarine 90a91d71
// TerminalScreen's phone: the chart is full-bleed under the floating header and footer (`--tm-foot` keeps its pins,
// the depth card and the callouts clear); the footer reads controls → View pill → the mode words → UP/DOWN (the chart
// controls mount once per breakpoint, `useIsDesktop`); the header is two rows (the session folds into the Window chip,
// crowd and earnings ride in Sensei's head); no one-tap card above the buttons — after the first prompted trade one
// toast a session offers it, and the switch lives in the trade settings; Markets · History · Settings is desktop's.
import { isStockSymbol, type TickerSymbol } from "@cwf/core";
import { usePathname } from "next/navigation";
import { holdStreamAwake } from "@cwf/markets/stream";
import { useCallback, useEffect, useRef, useState } from "react";
import { MotionScope } from "@/components/motion-scope";
import Link from "next/link";
import { CONNECT } from "@/lib/copy";
import { notify } from "@/lib/toast";
import { closeDrawer, useDrawerParam } from "@/lib/drawer-param";
import { usePrivacy } from "@/lib/privacy";
import { useWalletSession } from "@/lib/wallet-session";
import { TapArmModal, useSessionView } from "@/features/session";
import { useTapArmed } from "@/providers/wallet/tap-session";
import { LiveChart, type ChartHandle } from "./chart/LiveChart";
import { formatPrice, priceDecimals } from "./chart/engine";
import { TERMINAL } from "./copy";
import { clockText, money } from "./format";
import { gap0400NextOpen } from "./pick-window";
import { replaceTradeParams } from "./useTerminalWindow";
import { useMarketSession, type MarketSession } from "@/features/markets/session";
import { useTerminalState } from "./useTerminalState";
import { AssetChip, EquityPill, SettingsStack, ViewPositionPill, WindowChip } from "./ui/Chrome";
import { SessionCell, useSessionWord } from "./ui/SessionCell";
import { useIsDesktop } from "./useIsDesktop";
import "@/styles/terminal-phone.css";
import { useDemoSettle } from "./useDemoSettle";
import { HaltNotice } from "./ui/HaltNotice";
import { CrowdCell } from "./ui/CrowdCell";
import { EarningsCell } from "./ui/EarningsCell";
import { useLaneNote } from "./lane-note";
import type { TerminalPosition } from "./terminal-positions";
import { useTerminalClose } from "./useTerminalClose";
import { useWalletToasts } from "./useWalletToasts";
import type { PositionValue } from "./usePositionValue";
import { useTerminalBook } from "./useTerminalBook";
import { useTerminalBets } from "./parlay/useTerminalBets";
import { roiBpsOf } from "./positions-totals";
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
import { AccountDrawer, AlertsDrawer, DemoHistoryDrawer, ExitsDrawer, MarketsDrawer, PositionDetails, RoomDrawer, SenseiDrawer, SettingsDrawer, useDrawersMounted } from "./lazy-drawers";
import { usePendingFills } from "./fresh-fills";
import { ModeChips, ModePanel, type TerminalMode } from "./ui/ModePanel";
import { useDrawnBand } from "@/features/range/band-store";
import { TICKET_RAIL_MIN_WIDTH } from "@/features/markets/data/useSelection";
import dynamic from "next/dynamic";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { History, LineChart, Settings } from "lucide-react";
import "@/styles/terminal-side.css";

// The Markets hero's depth view, loaded when first shown (a lazy island).
const HeroDepth = dynamic(() => import("@/features/markets/hero/HeroDepth"), { ssr: false });

export const DRAWERS = { markets: "trade-markets", settings: "trade-settings", positions: "trade-positions", account: "trade-account", history: "trade-history", position: "trade-position", mode: "trade-mode", exits: "trade-exits", room: "trade-room", alerts: "trade-alerts", sensei: "trade-sensei" } as const;

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
  // DEMO (D-223): signed out, paper positions settle on their Window's real result.
  useDemoSettle(s.address === null);
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
  // Signed in but neither one-tap path on: every tap would prompt. The card says so and arms in one passkey prompt. A
  // browser wallet signs each call itself and can never arm (D-140), so it gets no card with a dead button (R4-0).
  const needsArm = session.isConnected && sessionView.status !== "not-passkey" && !tapArmed && sessionView.status !== "armed";
  // R4-3 (D-227): after the first passkey-prompted open, one toast a session — "One-tap is off · Turn on" — whose action
  // opens the arm modal itself (`TapArmModal`, no hidden trigger). A fresh fill (`usePendingFills`) is a trade this tab
  // just opened.
  const [armOpen, setArmOpen] = useState(false);
  const fillsSeen = useRef(pendingFills.length);
  useEffect(() => {
    const grew = pendingFills.length > fillsSeen.current;
    fillsSeen.current = pendingFills.length;
    if (!grew || !needsArm) return;
    try {
      if (window.sessionStorage.getItem(ARM_TOAST_KEY)) return;
      window.sessionStorage.setItem(ARM_TOAST_KEY, "1");
    } catch {
      // No session storage (a private window): the toast still says it once per mount.
    }
    notify.item({ id: "terminal-one-tap", title: TERMINAL.arm.toastTitle, action: { label: TERMINAL.arm.toastAction, onClick: () => setArmOpen(true) } });
  }, [pendingFills.length, needsArm]);
  const desktop = useIsDesktop();
  const sessionWord = useSessionWord(symbol, s.win.lane?.basis ?? null);
  const chartHandle = useRef<ChartHandle | null>(null);
  const market = s.market;
  const [pays, setPays] = useState("—");
  const closer = useTerminalClose();
  // Each row reports what Close pays for it; the totals, the equity and the chart's PnL row read them (D-197, D-227).
  const bets = useTerminalBets(s.address);
  const book = useTerminalBook(s, closer, masked, s.settings.trailPct, bets);
  const { values, onValue, totals, closingAll } = book;
  const onClose = useCallback((p: TerminalPosition, v: PositionValue) => void closer.close(p, v.exit), [closer]);
  const onTrailHit = useCallback((p: TerminalPosition, v: PositionValue, why: "trail" | "tp" | "sl") => closer.close(p, v.exit, undefined, why), [closer]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const onOpenPosition = useCallback((p: TerminalPosition) => {
    setDetailId(p.id);
    drawer.show(DRAWERS.position);
  }, [drawer]);
  const detail = s.positions.find((p) => p.id === detailId) ?? null;
  const closeAll = book.closeAll;
  const active = book.active;
  const totalRoiBps = roiBpsOf(totals.pnlBase, totals.costBase);
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
  const fb = useChartFeedback({ symbol, spot: s.spot.price, active: active.lead, value: active.leadValue, linePrice: s.openingRaw === null ? null : Number(s.openingRaw) / 1e8 });
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

  // The account drawer needs an account: signed out, the link says so instead of opening an empty drawer. History opens
  // DEMO's paper history there (R4-0, Owarine's demo account sheet).
  useEffect(() => {
    if (s.address || drawer.open !== DRAWERS.account) return;
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
  const equity = s.cashBase === null ? null : Number(s.cashBase + totals.equityBase) / 1e6;
  const stakeText = s.capped ? `${money(s.stakeBase)} max` : money(s.stakeBase);
  const count = s.positions.length + bets.rows.length;
  // The interval menu hides the stack under it (R4-0: the stack painted over 1m and 3m); the header's height places
  // toasts under it on a phone (toast.css `--tm-head`).
  const [menuOpen, setMenuOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  // The phone's footer floats over the full-bleed chart: its height keeps the chart's pins, the depth card and the
  // callouts clear of it (`--tm-foot`, terminal-phone.css). The band left above it — the stage's height before it went
  // full-bleed — compacts the stack as R4-0's stage-height queries did (`data-band`; review fix, the stage is now taller).
  const sideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sideRef.current;
    const screen = el?.parentElement;
    const stage = screen?.querySelector<HTMLElement>(".tm-stage");
    if (!el || !screen || !stage || desktop) return;
    const root = document.documentElement.style;
    const ro = new ResizeObserver(() => {
      const foot = Math.round(el.getBoundingClientRect().height);
      root.setProperty("--tm-foot", `${foot}px`);
      const band = screen.clientHeight - foot;
      stage.dataset.band = band <= 260 || (band <= 380 && screen.clientWidth <= 340) ? "shortest" : band <= 380 ? "short" : "";
    });
    ro.observe(el);
    ro.observe(screen);
    return () => {
      ro.disconnect();
      root.removeProperty("--tm-foot");
      delete stage.dataset.band;
    };
  }, [desktop]);
  const controls = <ChartControls handle={chartHandle} depthOn={depth} onDepth={setDepth} onRoom={() => drawer.show(DRAWERS.room)} onAlerts={() => drawer.show(DRAWERS.alerts)} onSensei={() => drawer.show(DRAWERS.sensei)} onMenu={setMenuOpen} />;
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const root = document.documentElement.style;
    const ro = new ResizeObserver(() => root.setProperty("--tm-head", `${Math.round(el.getBoundingClientRect().bottom)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--tm-head");
    };
  }, []);

  return (
    <MotionScope>
      <div className="tm-screen">
        <section className="tm-stage" aria-label={TERMINAL.chartLabel(s.name, priceText)} data-menu={menuOpen ? "" : undefined}>
          <LiveChart symbol={symbol} overlay={s.overlay} onFrame={fb.onFrame} view={s.settings.chartView} interval={s.settings.chartInterval} handle={chartHandle} label={TERMINAL.chartLabel(s.name, priceText)} />
          <ReactionOverlay handle={fb.overlayHandle} />
          {depth && market ? (
            <div className="tm-glass tm-depth">
              <HeroDepth market={market} />
            </div>
          ) : null}
          <div className="tm-stack-slot">
            <SettingsStack asset={symbol} size={stakeText} pays={s.settings.boostX > 1 ? TERMINAL.positions.boost(s.settings.boostX) : market ? pays : "—"} trailing={`${trailWords(s.settings.trailPct)}%`} onOpen={() => drawer.show(DRAWERS.settings)} />
          </div>
          {desktop ? <div className="tm-controls-slot">{controls}</div> : null}
          <div className="tm-top" ref={topRef}>
            <div className="tm-top-row">
              <span className="tm-lead">
                <AssetChip asset={symbol} name={s.name} price={s.spot.price} feed={feed} stale={s.spot.stale} connecting={s.spot.connecting} onOpen={() => drawer.show(DRAWERS.markets)} />
              </span>
              <EquityPill className="tm-phone" equity={equity} address={s.address} masked={masked} onOpen={() => drawer.show(DRAWERS.account)} onSignIn={session.connect} />
            </div>
            <div className="tm-window-row">
              {s.win.lanes.length ? (
                <WindowChip lanes={s.win.lanes} laneKey={s.win.lane?.key ?? null} onPick={(l) => replaceTradeParams({ lane: l.key, w: null })} state={s.windowText === TERMINAL.window.none ? (laneNote ?? s.windowText) : s.windowText} sessionWord={sessionWord} />
              ) : null}
              <div className="tm-cells tm-desk">
                <SessionCell symbol={symbol} basis={s.win.lane?.basis ?? null} />
                <CrowdCell symbol={symbol} />
                <EarningsCell symbol={symbol} market={market ?? null} />
              </div>
            </div>
            {s.win.lane?.basis === "stock24" ? <span className="tm-glass tm-note tm-note-feed tm-desk">{TERMINAL.feed.lane247(symbol)}</span> : offHours ? <span className="tm-glass tm-note tm-note-feed tm-desk">{TERMINAL.feed.offHoursNote}</span> : null}
          </div>
        </section>
        <aside className="tm-side" aria-label={TERMINAL.positions.title} ref={sideRef}>
          {/* Owarine 90a91d71 terminal sidebar (P3, D-223): Markets · History · Settings, then the balance — desktop only;
              a phone reaches them through the asset chip, the stack and the equity pill (R4-3). */}
          {desktop ? null : controls}
          <nav className="tm-side-tabs tm-desk" aria-label={TERMINAL.sideTabs.label}>
            <button type="button" onClick={() => drawer.show(DRAWERS.markets)}><LineChart aria-hidden />{TERMINAL.sideTabs.markets}</button>
            <button type="button" onClick={() => drawer.show(DRAWERS.history)}><History aria-hidden />{TERMINAL.sideTabs.history}</button>
            {/* The app's settings — sound, haptics (Owarine's sidebar Settings is the account's); the trade's own are the stack. */}
            <Link href="/settings/account#feedback"><Settings aria-hidden />{TERMINAL.sideTabs.settings}</Link>
          </nav>
          <div className="tm-desk tm-end">
            <EquityPill equity={equity} address={s.address} masked={masked} onOpen={() => drawer.show(DRAWERS.account)} onSignIn={session.connect} />
          </div>
          <div className="tm-side-list">
            <UnrealizedCard totals={totals} count={count} closable={book.closable} closing={closingAll} onCloseAll={() => void closeAll()} />
            <PositionsList positions={s.positions} bets={bets} pending={pendingFills} activeMarketId={market?.marketId ?? null} busyId={closer.busy} onClose={onClose} onOpen={onOpenPosition} onTrailHit={onTrailHit} onValue={onValue} onBetValue={book.onBetValue} />
          </div>
          {count > 0 ? <ViewPositionPill count={count} roiPct={totalRoiBps === null ? null : totalRoiBps / 100} onOpen={() => drawer.show(DRAWERS.positions)} /> : null}
          <TapArmModal open={armOpen} onOpenChange={setArmOpen} />
          <HaltNotice symbol={symbol} basis={s.win.lane?.basis ?? null} />
          {market ? <ModeChips mode={mode} onMode={chooseMode} /> : null}
          {mode !== "updown" && market ? (
            <div className="tm-desk"><ModePanel mode={mode} market={market} side={null} /></div>
          ) : active.lead ? (
            <TradeButtons
              mode="open"
              trailActive={active.trailing}
              trailEligible={active.eligible}
              trailNote={active.trailing ? TERMINAL.buttons.tabOnly : active.eligible ? null : TERMINAL.buttons.needMove(trailWords(s.settings.trailPct))}
              onTrail={active.trail}
              onClose={() => void active.close()}
              busy={active.busy ? "close" : null}
              lockedText={active.locked ? TERMINAL.buttons.locked(clockText(active.lead.expirySec)) : null}
            />
          ) : market && s.phase === "upcoming" ? (
            <ScheduledTrade market={market} stakeBase={s.stakeBase} />
          ) : market ? (
            <TerminalTrade market={market} phase={s.phase} stakeBase={s.stakeBase} spot={s.spot.price} boostX={s.settings.boostX} onPays={setPays} />
          ) : (
            // No Window listed: the pair stays, off, with why (Owarine `TradeButtons` `why`).
            <TradeButtons mode="flat" disabled onUp={noop} onDown={noop} busy={null} upSub={null} downSub={null} upNote={null} downNote={null} why={s.win.loading ? null : laneGapNext !== null ? TERMINAL.noWindow.gap0400(clockText(laneGapNext)) : noWindowNote(s.ticker, nyse, s.nowSec)} />
          )}
        </aside>
      </div>
      <Tutorial open={tourOpen} onDone={endTour} instant={instantTour} />
      {mode !== "updown" && market ? (
        <SlideOver open={drawer.open === DRAWERS.mode} onOpenChange={(o) => { if (!o) { drawer.close(); setMode("updown"); } }}>
          <SlideOverContent title={TERMINAL.modes.names[mode]} fields>
            <ModePanel mode={mode} market={market} side={null} />
          </SlideOverContent>
        </SlideOver>
      ) : null}
      {drawersMounted ? (
        <>
          <MarketsDrawer open={drawer.open === DRAWERS.markets} onOpenChange={(o) => !o && drawer.close()} symbol={symbol} set={s.win.set} nowSec={s.nowSec} onPick={pick} />
          <SettingsDrawer open={drawer.open === DRAWERS.settings} onOpenChange={(o) => !o && drawer.close()} stakeBase={s.stakeBase} minBase={s.minBase} maxBase={s.spendableBase} capped={s.capped ? s.capReason : null} pays={pays} />
          {s.address ? null : <DemoHistoryDrawer open={drawer.open === DRAWERS.history} onOpenChange={(o) => !o && drawer.close()} />}
          {s.address ? (
            <AccountDrawer
              open={drawer.open === DRAWERS.account || drawer.open === DRAWERS.history}
              initialView={drawer.open === DRAWERS.history ? "history" : "menu"}
              onOpenChange={(o) => !o && drawer.close()}
              wallet={s.address}
              equityBase={s.cashBase === null ? null : s.cashBase + totals.equityBase}
              walletBase={s.walletBase}
              totals={totals}
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
          <RoomDrawer open={drawer.open === DRAWERS.room} onOpenChange={(o) => !o && drawer.close()} symbol={symbol} window={market ? { marketId: market.marketId, asset: market.asset, intervalSec: market.intervalSec, expirySec: market.expirySec } : null} />
          <AlertsDrawer open={drawer.open === DRAWERS.alerts} onOpenChange={(o) => !o && drawer.close()} symbol={symbol} />
          <SenseiDrawer open={drawer.open === DRAWERS.sensei} onOpenChange={(o) => !o && drawer.close()} symbol={symbol} market={market} spot={s.spot.price} openingRaw={s.openingRaw} positions={s.positions} values={values} address={s.address} />
        </>
      ) : null}
      <SlideOver open={drawer.open === DRAWERS.positions} onOpenChange={(o) => !o && drawer.close()}>
        <SlideOverContent title={TERMINAL.positions.title}>
          <UnrealizedCard totals={totals} count={count} closable={book.closable} closing={closingAll} onCloseAll={() => void closeAll()} />
          <PositionsList positions={s.positions} bets={bets} pending={pendingFills} activeMarketId={market?.marketId ?? null} busyId={closer.busy} onClose={onClose} onOpen={onOpenPosition} onTrailHit={null} onValue={onValue} onBetValue={book.onBetValue} />
        </SlideOverContent>
      </SlideOver>
    </MotionScope>
  );
}

const noop = () => {};
const ARM_TOAST_KEY = "cwf.terminal.oneTapToast";

/** Why a symbol lists no Window right now (the state table, stage-23 "Window rule"). */
function noWindowNote(ticker: { redstoneFeedId: string | null; redstone24x7FeedId: string | null; kind: string } | null, nyse: MarketSession | null, nowSec: number): string {
  if (ticker && !ticker.redstoneFeedId) return TERMINAL.noWindow.spcx;
  const regularHours = nyse?.status.state === "regular" || nyse?.status.state === "early-close";
  const gapNext = ticker?.kind === "stock" && ticker.redstone24x7FeedId && !regularHours ? gap0400NextOpen("stock24", 300, nowSec) : null;
  if (gapNext !== null) return TERMINAL.noWindow.gap0400(clockText(gapNext));
  if (ticker?.kind === "stock" && !ticker.redstone24x7FeedId && !regularHours && nyse?.label) return TERMINAL.noWindow.regularOnly(nyse.label.replace(/^Opens /, ""));
  return TERMINAL.noWindow.none;
}
