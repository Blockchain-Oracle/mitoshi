"use client";
// Ported from Agari 03b30ab:web/src/features/alerts/AlertsWatcher.tsx (S13 step 7) — on the terminal's own live price
// (`useCommittedSpot`, 8-decimal integers) instead of a hero hook. Mounted once in the app shell; with no pending rule it
// reads nothing. A rule fires only on a fresh tick (≤ 60 s old) — the staleness gate — and a Regular-basis rule only
// inside the NYSE session; one crossing is one notification.
import { isStockSymbol } from "@cwf/core";
import { useEffect, useState } from "react";
import { useMarketSession } from "@/features/markets/session";
import { useCommittedSpot } from "@/features/terminal/live";
import { useNoticeTopics } from "@/features/notifications/topics";
import { notify } from "@/lib/toast";
import { nowMs } from "@/lib/clock";
import { ALERTS } from "./copy";
import { sendNotification } from "./notifications";
import { checkAlerts, loadAlerts, subscribeAlerts, type AlertBasis } from "./store";

const FRESH_TICK_MS = 60_000;
const SCALE = 8;
const usd = (e8: bigint) => `$${(Number(e8) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function AssetWatch({ asset, bases }: { asset: string; bases: readonly AlertBasis[] }) {
  const spot = useCommittedSpot(asset, { seed: false });
  const session = useMarketSession();
  const topics = useNoticeTopics();
  useEffect(() => {
    if (spot.priceE8 === null || spot.atMs === null || spot.stale || nowMs() - spot.atMs > FRESH_TICK_MS) return;
    const inSession = !isStockSymbol(asset) || (session?.open === true && session.status.state !== "halted");
    for (const basis of bases) {
      if (basis === "regular" && !inSession) continue;
      for (const alert of checkAlerts(asset, basis, spot.priceE8, SCALE)) {
        const title = ALERTS.fired.title(asset, alert.direction, `$${(alert.targetCents / 100).toFixed(2)}`);
        const body = ALERTS.fired.body(usd(spot.priceE8));
        if (topics.alerts) sendNotification(title, body);
        notify.item({ id: `alert-${alert.id}`, title, description: body });
      }
    }
  }, [asset, bases, spot.priceE8, spot.atMs, spot.stale, session, topics.alerts]);
  return null;
}

export function AlertsWatcher() {
  const [watch, setWatch] = useState<Map<string, AlertBasis[]>>(new Map());
  useEffect(() => {
    const sync = () => {
      const m = new Map<string, AlertBasis[]>();
      for (const a of loadAlerts()) if (!a.triggered) m.set(a.asset, [...new Set([...(m.get(a.asset) ?? []), a.basis])]);
      setWatch(m);
    };
    sync();
    return subscribeAlerts(sync);
  }, []);
  return (
    <>
      {[...watch].map(([asset, bases]) => (
        <AssetWatch key={asset} asset={asset} bases={bases} />
      ))}
    </>
  );
}
