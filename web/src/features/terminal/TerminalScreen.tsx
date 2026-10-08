"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/TerminalScreen.tsx — split per the stage plan
// (`useTerminalState`, `TerminalTrade`, the drawers), on Mitoshi's markets and shell: no demo (D-191), drawers on the
// right edge in the URL (D-190), the shell's rail beside it (D-192). One tree for every width; CSS places it.
import type { TickerSymbol } from "@cwf/core";
import { usePathname } from "next/navigation";
import { holdStreamAwake } from "@cwf/markets/stream";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionScope } from "@/components/motion-scope";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { EVERYTHING_DRAWER } from "@/components/shell/Rail";
import { BRAND, SHELL } from "@/lib/copy";
import { closeDrawer, openDrawer, useDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { usePrivacy } from "@/lib/privacy";
import { useWalletSession } from "@/lib/wallet-session";
import { LiveChart, type ChartHandle } from "./chart/LiveChart";
import { formatPrice, priceDecimals } from "./chart/engine";
import { TERMINAL } from "./copy";
import { clockText, livePnlText, money } from "./format";
import { replaceTradeParams } from "./useTerminalWindow";
import { useTerminalState } from "./useTerminalState";
import { AssetChip, EquityPill, SettingsStack, ViewPositionPill, WindowChip } from "./ui/Chrome";
import { MarketsDrawer } from "./ui/MarketsDrawer";
import type { TerminalPosition } from "./terminal-positions";
import { useTerminalClose } from "./useTerminalClose";
import { useTrailToggle } from "./useTrail";
import { trailEligible } from "./position-value";
import type { PositionValue } from "./usePositionValue";
import { PositionsList, UnrealizedCard } from "./ui/PositionsPanel";
import { TradeButtons, trailWords } from "./ui/TradeButtons";
import { SettingsDrawer } from "./ui/SettingsDrawer";
import { TerminalTrade } from "./ui/TerminalTrade";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";

export const DRAWERS = { markets: "trade-markets", settings: "trade-settings", positions: "trade-positions" } as const;

/** The symbol in the address: a market switch rewrites it in place (no remount), so the path is the source. */
function useSymbol(initial: string): string {
  const path = usePathname();
  const m = /^\/trade\/([A-Z]{2,6})$/.exec(path ?? "");
  return m ? m[1]! : initial;
}

export function TerminalScreen({ symbol: initial }: { symbol: string }) {
  const symbol = useSymbol(initial);
  const s = useTerminalState(symbol);
  const session = useWalletSession();
  const masked = usePrivacy();
  const drawer = useDrawerParam();
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
  const onTrailHit = useCallback((p: TerminalPosition, v: PositionValue) => closer.close(p, v.exit, undefined, "trail"), [closer]);
  const toggleTrail = useTrailToggle();
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
    const levels = be === null ? base.levels : [...base.levels, { kind: "breakeven" as const, price: be, label: "B/E" }];
    s.overlay.current = { ...base, levels, pnl: pnlBase === null ? null : Number(pnlBase) / 1e6, pnlText: pnlBase === null ? "" : masked ? SHELL.masked : livePnlText(pnlBase) };
  }
  // An armed trail keeps hearing its price with the tab in the background (it still needs Mitoshi open).
  const trailing = s.positions.some((p) => p.trailStop !== null);
  useEffect(() => (trailing ? holdStreamAwake() : undefined), [trailing]);

  const pick = (next: TickerSymbol) => {
    // Replacing the drawer's entry closes it and lands on the new market; Back returns to the previous one.
    if (next !== symbol) window.history.replaceState(null, "", `/trade/${next}`);
    else closeDrawer();
  };

  const feed = TERMINAL.feed[s.spot.source ?? "redstone"];
  const priceText = s.spot.price === null ? "—" : `$${formatPrice(s.spot.price, priceDecimals(s.spot.price))}`;
  const equity = s.cashBase === null ? null : Number(s.cashBase + totals.value) / 1e6;
  const stakeText = `${money(s.stakeBase)}${s.capped ? " ·" : ""}`;
  const count = s.positions.length;

  return (
    <MotionScope>
      <div className="tm-screen">
        <section className="tm-stage" aria-label={TERMINAL.chartLabel(s.name, priceText)}>
          <LiveChart symbol={symbol} overlay={s.overlay} view={s.settings.chartView} interval={s.settings.chartInterval} handle={chartHandle} label={TERMINAL.chartLabel(s.name, priceText)} />
          <div className="tm-top">
            <div className="tm-top-row">
              <span className="tm-lead">
                <button type="button" className="tm-glass tm-disc tm-phone" aria-label={BRAND.name} onClick={() => (tapFeedback(), openDrawer(EVERYTHING_DRAWER))}>
                  <MitoshiMark />
                </button>
                <AssetChip asset={symbol} name={s.name} price={s.spot.price} feed={feed} stale={s.spot.stale} onOpen={() => drawer.show(DRAWERS.markets)} />
              </span>
              <EquityPill className="tm-phone" equity={equity} address={s.address} masked={masked} onOpen={() => (window.location.href = "/portfolio")} onSignIn={session.connect} />
            </div>
            {s.win.lanes.length ? (
              <WindowChip lanes={s.win.lanes} laneKey={s.win.lane?.key ?? null} onPick={(l) => replaceTradeParams({ lane: l.key, w: null })} state={s.windowText} />
            ) : s.win.loading ? null : (
              <span className="tm-glass tm-note">{s.ticker && !s.ticker.redstoneFeedId ? TERMINAL.noWindow.spcx : TERMINAL.noWindow.none}</span>
            )}
          </div>
          <div className="tm-stack-slot">
            <SettingsStack asset={symbol} size={stakeText} pays={market ? pays : "—"} trailing={`${trailWords(s.settings.trailPct)}%`} onOpen={() => drawer.show(DRAWERS.settings)} />
          </div>
        </section>
        <aside className="tm-side" aria-label={TERMINAL.positions.title}>
          <div className="tm-desk tm-end">
            <EquityPill equity={equity} address={s.address} masked={masked} onOpen={() => (window.location.href = "/portfolio")} onSignIn={session.connect} />
          </div>
          <div className="tm-side-list">
            <UnrealizedCard pnlBase={totals.pnl} costBase={totals.cost} count={count} closing={closingAll} onCloseAll={() => void closeAll()} />
            <PositionsList positions={s.positions} activeMarketId={market?.marketId ?? null} busyId={closer.busy} onClose={onClose} onTrailHit={onTrailHit} onValue={onValue} />
          </div>
          {count > 0 ? <ViewPositionPill count={count} roiPct={totals.pnl !== null && totals.cost > 0n ? Number((totals.pnl * 10_000n) / totals.cost) / 100 : null} onOpen={() => drawer.show(DRAWERS.positions)} /> : null}
          {s.active ? (
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
          ) : market ? (
            <TerminalTrade market={market} phase={s.phase} stakeBase={s.stakeBase} spot={s.spot.price} onPays={setPays} />
          ) : null}
        </aside>
      </div>
      <MarketsDrawer open={drawer.open === DRAWERS.markets} onOpenChange={(o) => !o && drawer.close()} symbol={symbol} set={s.win.set} nowSec={s.nowSec} onPick={pick} />
      <SettingsDrawer open={drawer.open === DRAWERS.settings} onOpenChange={(o) => !o && drawer.close()} stakeBase={s.stakeBase} minBase={s.minBase} maxBase={s.spendableBase} />
      <SlideOver open={drawer.open === DRAWERS.positions} onOpenChange={(o) => !o && drawer.close()}>
        <SlideOverContent title={TERMINAL.positions.title}>
          <UnrealizedCard pnlBase={totals.pnl} costBase={totals.cost} count={count} closing={closingAll} onCloseAll={() => void closeAll()} />
          <PositionsList positions={s.positions} activeMarketId={market?.marketId ?? null} busyId={closer.busy} onClose={onClose} onTrailHit={null} onValue={onValue} />
        </SlideOverContent>
      </SlideOver>
    </MotionScope>
  );
}

