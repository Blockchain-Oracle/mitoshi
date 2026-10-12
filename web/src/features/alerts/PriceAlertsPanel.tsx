"use client";
// Price alerts for one market (S13 step 7; Agari 03b30ab `PriceAlertsButton`'s form and list, in a terminal drawer):
// above or below a price, on the session price or at any hour for a stock, the market's alerts with a remove each, and
// the browser-notification permission. Rules stay on this device (`store.ts`); the watcher says them while Mitoshi is open.
import { isStockSymbol } from "@cwf/core";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ALERTS } from "./copy";
import { notificationState, requestNotificationPermission, type NotificationState } from "./notifications";
import { addAlert, loadAlerts, parseTargetCents, removeAlert, subscribeAlerts, type AlertBasis, type AlertDirection, type PriceAlert } from "./store";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Alerts with a remove each; `withAsset` names the market (the settings page lists every market's). */
export function AlertList({ alerts, withAsset = false }: { alerts: readonly PriceAlert[]; withAsset?: boolean }) {
  return (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline">
      {alerts.map((a) => {
        const line = ALERTS.line(a.direction, usd(a.targetCents));
        return (
          <li key={a.id} className="flex min-h-touch items-center gap-2 px-3">
            <Bell aria-hidden className={`size-4 flex-none ${a.triggered ? "text-ink-secondary" : "text-accent"}`} />
            <span className="min-w-0 flex-1 type-body text-ink">{withAsset ? `${a.asset} ` : ""}{line}{isStockSymbol(a.asset) ? ` · ${ALERTS.basis[a.basis]}` : ""}{a.triggered ? ` · ${ALERTS.done}` : ""}</span>
            <button type="button" aria-label={ALERTS.remove(withAsset ? `${a.asset} ${line}` : line)} title={ALERTS.remove(withAsset ? `${a.asset} ${line}` : line)} onClick={() => removeAlert(a.id)} className="grid size-touch flex-none place-items-center rounded-full text-ink-secondary hover:text-ink"><X aria-hidden className="size-4" /></button>
          </li>
        );
      })}
    </ul>
  );
}

export function PriceAlertsPanel({ symbol }: { symbol: string }) {
  const stock = isStockSymbol(symbol);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [basis, setBasis] = useState<AlertBasis>(stock ? "regular" : "allDay");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationState>("unsupported");
  useEffect(() => {
    const sync = () => setAlerts(loadAlerts().filter((a) => a.asset === symbol));
    sync();
    setPerm(notificationState());
    return subscribeAlerts(sync);
  }, [symbol]);
  const add = () => {
    const cents = parseTargetCents(text);
    if (cents === null) return void setError(ALERTS.bad);
    setError(null);
    addAlert(symbol, stock ? basis : "allDay", cents, direction);
    setText("");
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="type-caption text-ink-secondary">{ALERTS.lead(symbol)}</p>
      <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), add())}>
        <div role="radiogroup" aria-label={ALERTS.title} className="flex gap-2">
          {(["above", "below"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} className={`min-h-touch flex-1 rounded-full border type-body-strong ${direction === d ? "border-accent bg-accent/10" : "border-hairline"}`}>{ALERTS[d]}</button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="type-caption text-ink-secondary">{ALERTS.target}</span>
          <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0.00" aria-invalid={error ? true : undefined} className="min-h-touch rounded-md border border-hairline bg-surface-1 px-3 text-base tabular-nums text-ink" />
          {error ? <span role="alert" className="type-caption text-warning">{error}</span> : null}
        </label>
        {stock ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="type-caption text-ink-secondary">{ALERTS.basisHint}</legend>
            {(["regular", "allDay"] as const).map((b) => (
              <label key={b} className="flex min-h-touch items-center gap-2">
                <input type="radio" name="alert-basis" checked={basis === b} onChange={() => setBasis(b)} className="size-4 accent-[var(--color-accent)]" />
                <span className="type-body text-ink">{ALERTS.basis[b]}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <button type="submit" className="min-h-touch rounded-full bg-accent-fill px-4 type-body-strong text-on-accent">{ALERTS.add}</button>
      </form>
      {alerts.length === 0 ? <p className="type-caption text-ink-secondary">{ALERTS.none}</p> : <AlertList alerts={alerts} />}
      {perm === "default" ? <button type="button" className="min-h-touch self-start rounded-full border border-hairline px-4 type-body-strong" onClick={() => void requestNotificationPermission().then(() => setPerm(notificationState()))}>{ALERTS.allow}</button> : null}
      {perm === "granted" ? <p className="type-caption text-ink-secondary">{ALERTS.allowed}</p> : null}
      {perm === "denied" ? <p className="type-caption text-ink-secondary">{ALERTS.blocked}</p> : null}
    </div>
  );
}
