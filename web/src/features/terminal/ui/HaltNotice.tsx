"use client";
// The halt banner over UP/DOWN (S6; 21st 19366 via `NoticeAlert`): what stopped this Window's price, since when, and
// what happens to a call already open. The Window chip's session cell says the halt too; this one sits where the tap is.
import { haltLabel, isTickerSymbol, type HaltEntry, type LaneBasis } from "@cwf/core";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { laneHaltAsset, useMarketSession } from "@/features/markets/session";
import { SESSION } from "@/features/markets/session/copy";
import { useWhen } from "@/lib/when";

export function HaltNoticeView({ halt, symbol, nowSec }: { halt: HaltEntry; symbol: string; nowSec?: number }) {
  const when = useWhen();
  return <NoticeAlert tone="warning" role="alert" title={haltLabel(halt.reason)} description={SESSION.haltBody[halt.reason](symbol, when(halt.sinceSec, nowSec === undefined ? {} : { nowSec }))} />;
}

export function HaltNotice({ symbol, basis }: { symbol: string; basis: LaneBasis | null }) {
  const asset = isTickerSymbol(symbol) && basis ? laneHaltAsset(symbol, basis) : undefined;
  const halt = useMarketSession(asset)?.halt ?? null;
  return asset && halt ? <HaltNoticeView halt={halt} symbol={symbol} /> : null;
}
