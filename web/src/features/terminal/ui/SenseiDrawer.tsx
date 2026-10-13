"use client";
// Sensei (S13 step 8; Owarine's drawer since D-226, `features/sensei/SenseiSheet`) over the market on screen. The
// figures a question carries are read the moment it is asked: the spot, the Window on screen with its line and each
// side's price from the book, the NYSE session for a stock, the open positions with what Close pays, the settled
// record (Sensei's brake reads a losing run) and the stock's next report. Mounted only while open, so its reads cost
// nothing otherwise. R4-3 (D-227): the crowd and the next report ride in its head — on a phone they left the terminal's
// header, which keeps Owarine's two rows.
import { EARNINGS_LOOKAHEAD_DAYS, addDays, etDateOf, formatCadence, isStockSymbol, type Address, type EventMarket, type Side } from "@cwf/core";
import { useAccountHistory } from "@cwf/markets/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTopOfBook } from "@/features/markets/data/useTopOfBook";
import { useMarketSession } from "@/features/markets/session";
import type { SenseiContext } from "@/features/sensei/protocol";
import { recordOf } from "@/features/sensei/record";
import { SenseiSheet } from "@/features/sensei/SenseiSheet";
import type { TerminalPosition } from "../terminal-positions";
import type { PositionValue } from "../usePositionValue";
import { CrowdCell } from "./CrowdCell";
import { EarningsCell } from "./EarningsCell";

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
  /** Markets: a side on the trade card opens the ticket with it chosen. */
  onAct?: (marketId: EventMarket["marketId"], side: Side) => void;
}

const MAX_POSITIONS = 8;
const cents = (base: bigint, decimals: number) => Math.max(0, Number(base / 10n ** BigInt(Math.max(0, decimals - 2))));
const minsTo = (sec: number) => Math.max(0, Math.floor((sec - Date.now() / 1000) / 60));

function SenseiBody({ open, onClose, ...p }: Omit<SenseiDrawerProps, "onOpenChange"> & { onClose: () => void }) {
  const top = useTopOfBook(p.market);
  const nyse = useMarketSession();
  const history = useAccountHistory(p.address);
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
  const cells = (
    <>
      <CrowdCell symbol={p.symbol} />
      <EarningsCell symbol={p.symbol} market={p.market} />
    </>
  );
  return <SenseiSheet open={open} onClose={onClose} read={read} market={p.market} openingRaw={p.openingRaw} onAct={p.onAct} cells={cells} />;
}

export function SenseiDrawer({ open, onOpenChange, ...rest }: SenseiDrawerProps) {
  // Mounted closed for a frame so the drawer slides in (Owarine's transform transition) rather than appearing.
  // Its reads (the wallet's record, the session) cost nothing until Sensei is first opened.
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    const id = requestAnimationFrame(() => setShown(open));
    return () => cancelAnimationFrame(id);
  }, [open]);
  if (!mounted) return null;
  return <SenseiBody {...rest} open={open && shown} onClose={() => onOpenChange(false)} />;
}
