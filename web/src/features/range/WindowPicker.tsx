"use client";
/**
 * The Window a round sits on (R4-5, D-227; Ported from Owarine 90a91d71:web/src/features/range/WindowPicker.tsx — every
 * live Window, soonest first, no cut to four): the cadences as TextTabs (5m · 15m · 1h · Gap, only those with a priced
 * Window live; the last one is remembered by the page) over a sideways rail of chips (the kit's ScrollRail, 21st 10484: edge fades, a named region) — the
 * asset's disc, its ticker (a 24/7 lane marked) and the time left on a small ring — acting as one radiogroup whose
 * arrow keys move the pick (the roving focus of 21st.dev 35042 kuratlielia/chip-group, single-select, no morph). Shared by Range
 * and Moonshot; an asset the reserve can't price is a disabled chip with its reason as the title.
 */
import { formatCadence } from "@cwf/core/copy";
import type { EventMarket, MarketId } from "@cwf/core";
import { useRef, type KeyboardEvent } from "react";
import { CountdownRing } from "@/components/kit/CountdownRing";
import { ScrollRail } from "@/components/kit/ScrollRail";
import { TextTabs } from "@/components/kit/TextTabs";
import { cn } from "@/lib/utils";
import { AssetDisc } from "../markets/hero/AssetDisc";
import { RANGE } from "./copy";
import type { BandWindow } from "./data";
import "@/components/kit/kit.css";

export const cadenceKeyOf = (m: EventMarket): string => (m.lane === "gap" ? "gap" : formatCadence(m.intervalSec));
/** The cadences these Windows run on, shortest first and the Gap last — a fixed order, not the soonest close's (R4-5
 *  review: a 15m and a 1h Window closing at the same instant swapped the two tabs as the list re-sorted). */
export const cadenceKeysOf = (ws: readonly { market: EventMarket }[]): string[] =>
  [...new Map(ws.map((w) => [cadenceKeyOf(w.market), w.market.lane === "gap" ? Number.POSITIVE_INFINITY : w.market.intervalSec] as const))].sort((a, b) => a[1] - b[1]).map(([k]) => k);
/** "3d", "20h" — when a Gap Window comes inside the reserve's horizon. */
const formatDays = (sec: number) => (sec >= 86_400 ? `${Math.ceil(sec / 86_400)}d` : `${Math.max(1, Math.ceil(sec / 3_600))}h`);
const cadenceLabel = (key: string) => (key === "gap" ? RANGE.windows.gap : key);

export function WindowPicker({ windows, pickedId, onPick, gapInSec = null }: { windows: readonly BandWindow[]; pickedId: MarketId | null; onPick: (id: MarketId) => void; gapInSec?: number | null }) {
  const priced = windows.filter((w) => w.model !== null);
  const keys = cadenceKeysOf(priced);
  const picked = priced.find((w) => w.market.marketId === pickedId) ?? null;
  const cadence = picked ? cadenceKeyOf(picked.market) : (keys[0] ?? "");
  const chips = windows.filter((w) => cadenceKeyOf(w.market) === cadence);
  const rail = useRef<HTMLDivElement>(null);
  const choose = (key: string) => {
    const first = priced.find((w) => cadenceKeyOf(w.market) === key);
    if (first) onPick(first.market.marketId);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const live = chips.filter((w) => w.model !== null);
    const at = live.findIndex((w) => w.market.marketId === pickedId);
    const next = live[(at + step + live.length) % live.length];
    if (!next) return;
    onPick(next.market.marketId);
    rail.current?.querySelector<HTMLElement>(`[data-id="${next.market.marketId}"]`)?.focus();
  };
  const allHoursTwin = (m: EventMarket) => m.lane === "stock24" && chips.some((w) => w.market.asset === m.asset && w.market.lane === "regular");
  return (
    <div className="gw">
      {keys.length > 0 ? <TextTabs value={cadence} onChange={choose} label={RANGE.windows.cadence} tabs={keys.map((k) => ({ value: k, label: cadenceLabel(k) }))} className="gw-tabs" /> : null}
      <ScrollRail label={RANGE.windows.rail} className="gw-rail">
        <div ref={rail} className="gw-group" role="radiogroup" aria-label={RANGE.windows.label} onKeyDown={onKey}>
          {chips.map(({ market: m, model }) => {
            const on = m.marketId === pickedId;
            return (
              <button
                key={m.marketId}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (!pickedId && model) ? 0 : -1}
                data-id={m.marketId}
                disabled={!model}
                title={model ? undefined : RANGE.windows.noModel(m.asset)}
                className={cn("gw-chip", on && "is-on")}
                onClick={() => onPick(m.marketId)}
              >
                <AssetDisc asset={m.asset} className="gw-disc" />
                <span className="gw-sym">{m.asset}</span>
                {allHoursTwin(m) ? <span className="gw-tag">{RANGE.windows.allHours}</span> : null}
                <CountdownRing startMs={m.tradingStartSec * 1000} endMs={m.lockAtSec * 1000} size="sm" className="gw-ring" />
              </button>
            );
          })}
          {gapInSec !== null && !keys.includes("gap") ? (
            <button type="button" disabled className="gw-chip" title={RANGE.windows.gapLater(formatDays(gapInSec))}>
              <span className="gw-sym">{RANGE.windows.gap}</span>
              <span className="gw-tag">{formatDays(gapInSec)}</span>
            </button>
          ) : null}
        </div>
      </ScrollRail>
    </div>
  );
}
