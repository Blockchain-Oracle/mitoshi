"use client";
// Sensei on the terminal (S13 step 8): a right-edge drawer (the owner's overlay rule) over the market on screen. The
// figures a question carries are read the moment it is asked: the spot, the Window on screen with its line and each
// side's price from the book, the NYSE session for a stock, the open positions with what Close pays, the settled
// record (Sensei's brake reads a losing run) and the stock's next report. Mounted only while open, so its reads cost
// nothing otherwise.
import { EARNINGS_LOOKAHEAD_DAYS, addDays, etDateOf, formatCadence, isStockSymbol, type Address, type EventMarket } from "@cwf/core";
import { useWalletHistory } from "@cwf/markets/react";
import { useCallback, useRef } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { useTopOfBook } from "@/features/markets/data/useTopOfBook";
import { useMarketSession } from "@/features/markets/session";
import { SENSEI } from "@/features/sensei/copy";
import type { SenseiContext } from "@/features/sensei/protocol";
import { recordOf } from "@/features/sensei/record";
import { SenseiPanel } from "@/features/sensei/SenseiPanel";
import type { TerminalPosition } from "../terminal-positions";
import type { PositionValue } from "../usePositionValue";

export interface SenseiDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  symbol: string;
  market: EventMarket | null;
  spot: number | null;
  /** The Window's opening print, 8 decimals. */
  openingRaw: bigint | null;
  positions: readonly TerminalPosition[];
  values: ReadonlyMap<string, PositionValue>;
  address: Address | null;
}

const MAX_POSITIONS = 8;
const cents = (base: bigint, decimals: number) => Math.max(0, Number(base / 10n ** BigInt(Math.max(0, decimals - 2))));
const minsTo = (sec: number) => Math.max(0, Math.floor((sec - Date.now() / 1000) / 60));

function SenseiBody(p: Omit<SenseiDrawerProps, "open" | "onOpenChange">) {
  const top = useTopOfBook(p.market);
  const nyse = useMarketSession();
  const history = useWalletHistory(p.address);
  const latest = useRef({ p, top, nyse, history });
  latest.current = { p, top, nyse, history };

  const read = useCallback((): SenseiContext => {
    const { p: x, top: t, nyse: s, history: h } = latest.current;
    const stock = isStockSymbol(x.symbol);
    const m = x.market;
    const today = etDateOf(Math.floor(Date.now() / 1000));
    return {
      snapshot: {
        prices: x.spot === null ? {} : { [x.symbol]: x.spot },
        windows: m
          ? [{ asset: m.asset, cadence: formatCadence(m.intervalSec), lane: m.lane, minsToClose: minsTo(m.lockAtSec), lineUsd: x.openingRaw === null ? null : Number(x.openingRaw) / 1e8, upCents: t.upCents, downCents: t.downCents }]
          : [],
      },
      ...(stock ? { session: s ? { state: s.status.state, label: s.label.slice(0, 60) } : null } : {}),
      positions: x.positions.slice(0, MAX_POSITIONS).map((q) => {
        const v = x.values.get(q.id)?.valueBase ?? null;
        return { asset: q.asset, cadence: formatCadence(q.intervalSec), side: q.side, via: q.via, stakeCents: cents(q.costBase, q.decimals), markCents: v === null ? null : cents(v, q.decimals), minsToClose: minsTo(q.expirySec) };
      }),
      ...(h?.ok ? { record: recordOf(h.value.rounds) } : {}),
      ...(stock
        ? { earnings: s?.earnings ? s.earnings.filter((e) => e.symbol === x.symbol && e.dateEt >= today && e.dateEt <= addDays(today, EARNINGS_LOOKAHEAD_DAYS)).map((e) => ({ symbol: e.symbol, dateEt: e.dateEt, hour: e.hour })) : null }
        : {}),
    };
  }, []);
  return <SenseiPanel read={read} />;
}

export function SenseiDrawer({ open, onOpenChange, ...rest }: SenseiDrawerProps) {
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={SENSEI.title}>{open ? <SenseiBody {...rest} /> : null}</SlideOverContent>
    </SlideOver>
  );
}
