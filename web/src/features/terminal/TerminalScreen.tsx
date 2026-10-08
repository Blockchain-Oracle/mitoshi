"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/TerminalScreen.tsx — split per the stage plan
// (`useTerminalState`, `TerminalTrade`, the drawers), on Mitoshi's markets and shell: no demo (D-191), drawers on the
// right edge in the URL (D-190), the shell's rail beside it (D-192). One tree for every width; CSS places it.
import type { TickerSymbol } from "@cwf/core";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { MotionScope } from "@/components/motion-scope";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { EVERYTHING_DRAWER } from "@/components/shell/Rail";
import { BRAND } from "@/lib/copy";
import { closeDrawer, openDrawer, useDrawerParam } from "@/lib/drawer-param";
import { tapFeedback } from "@/lib/feedback";
import { usePrivacy } from "@/lib/privacy";
import { useWalletSession } from "@/lib/wallet-session";
import { LiveChart, type ChartHandle } from "./chart/LiveChart";
import { formatPrice, priceDecimals } from "./chart/engine";
import { TERMINAL } from "./copy";
import { money } from "./format";
import { replaceTradeParams } from "./useTerminalWindow";
import { useTerminalState } from "./useTerminalState";
import { AssetChip, EquityPill, SettingsStack, ViewPositionPill, WindowChip } from "./ui/Chrome";
import { MarketsDrawer } from "./ui/MarketsDrawer";
import { PositionsList } from "./ui/PositionsPanel";
import { SettingsDrawer } from "./ui/SettingsDrawer";
import { TerminalTrade } from "./ui/TerminalTrade";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { trailWords } from "./ui/TradeButtons";

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

  const pick = (next: TickerSymbol) => {
    // Replacing the drawer's entry closes it and lands on the new market; Back returns to the previous one.
    if (next !== symbol) window.history.replaceState(null, "", `/trade/${next}`);
    else closeDrawer();
  };

  const feed = TERMINAL.feed[s.spot.source ?? "redstone"];
  const priceText = s.spot.price === null ? "—" : `$${formatPrice(s.spot.price, priceDecimals(s.spot.price))}`;
  const equity = s.cashBase === null ? null : Number(s.cashBase) / 1e6;
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
            <PositionsList positions={s.positions} activeMarketId={market?.marketId ?? null} />
          </div>
          {count > 0 ? <ViewPositionPill count={count} roiPct={null} onOpen={() => drawer.show(DRAWERS.positions)} /> : null}
          {market ? <TerminalTrade market={market} phase={s.phase} stakeBase={s.stakeBase} spot={s.spot.price} onPays={setPays} /> : null}
        </aside>
      </div>
      <MarketsDrawer open={drawer.open === DRAWERS.markets} onOpenChange={(o) => !o && drawer.close()} symbol={symbol} set={s.win.set} nowSec={s.nowSec} onPick={pick} />
      <SettingsDrawer open={drawer.open === DRAWERS.settings} onOpenChange={(o) => !o && drawer.close()} stakeBase={s.stakeBase} minBase={s.minBase} maxBase={s.spendableBase} />
      <SlideOver open={drawer.open === DRAWERS.positions} onOpenChange={(o) => !o && drawer.close()}>
        <SlideOverContent title={TERMINAL.positions.title}>
          <PositionsList positions={s.positions} activeMarketId={market?.marketId ?? null} />
        </SlideOverContent>
      </SlideOver>
    </MotionScope>
  );
}

