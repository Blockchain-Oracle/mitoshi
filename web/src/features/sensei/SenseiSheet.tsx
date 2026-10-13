"use client";
// Sensei's drawer (D-226) — Owarine 90a91d71 `features/sensei/SenseiDrawer.tsx` and `SenseiTradeCards.tsx`, on Mitoshi's
// streamed thread (`useSenseiChat`), its consent (S13, before the first question) and the figures read at ask time:
// the header, the live meter (spot, drift, time left, the Window's tape), the thread with Sensei's mark, follow-up chips,
// the Window to act on once there is a read (a side opens the ticket with it chosen), starters on the first turn, the
// composer and the not-advice line. The CSS is Owarine's (`yosuku/part-02.css` .sensei-drawer…, `part-03.css`).
// R4-2 (D-227): on a phone the aside fits what the keyboard leaves while the composer has focus (`useKeyboardInset`),
// so the input and Send stay above it; ✕ keeps a 44 px hit area.
import { computeDrift, formatCadence, type EventMarket, type Side } from "@cwf/core";
import { formatClock } from "@cwf/core/units";
import { useEffect, useRef, useState } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { CardSpark } from "@/features/markets/lanes/CardSpark";
import { useChartSeries } from "@/features/markets/data/useChartSeries";
import { useTopOfBook } from "@/features/markets/data/useTopOfBook";
import { usd2 } from "@/features/markets/units";
import { useClockValue } from "@/lib/clock";
import { useKeyboardInset } from "@/lib/keyboard-inset";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/toast";
import { consentCovers, grantAiConsent, useAiConsent, withdrawAiConsent } from "./consent";
import { chipsFor, SENSEI, SENSEI_STARTERS } from "./copy";
import type { SenseiContext, SenseiStatus } from "./protocol";
import { SenseiConsent } from "./SenseiConsent";
import { useSenseiChat } from "./useSenseiChat";

/** The drift window and its flat band, as Owarine's snapshot reads them. */
const DRIFT_WINDOW_MIN = 5;
const FLAT_BAND_FRACTION = 0.00005;

let statusOnce: Promise<SenseiStatus | null> | null = null;
const readStatus = () =>
  (statusOnce ??= fetch("/api/sensei", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SenseiStatus>) : null))
    .catch(() => null)
    .then((s) => (s === null && (statusOnce = null), s)));

/** The pinned strip every reply sits under: price, drift, time left, tape. */
function SenseiMeter({ market, openingRaw }: { market: EventMarket | null; openingRaw: bigint | null }) {
  const series = useChartSeries(market);
  const points = series?.ok ? series.value.points : [];
  const latestRaw = points.at(-1)?.valueRaw ?? null;
  const band = latestRaw === null ? 1n : BigInt(Math.max(1, Math.round(Number(latestRaw) * FLAT_BAND_FRACTION)));
  const drift = latestRaw === null ? null : computeDrift(points, DRIFT_WINDOW_MIN, band);
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  const left = market && nowSec > 0 ? Math.max(0, market.expirySec - nowSec) : null;
  const urgent = left !== null && left <= 60;
  return (
    <div className={cn("sensei-meter", `sd-dir-${drift?.direction ?? "flat"}`, urgent && "urgent")}>
      <div className="sm-read">
        <span className="sm-spot">{latestRaw === null ? SENSEI.meter.reading : usd2(latestRaw)}</span>
        {drift ? (
          <>
            <span className="sm-tri" aria-hidden />
            <span className="sm-drift">{drift.direction === "flat" ? SENSEI.meter.flat : `${drift.moveRaw > 0n ? "+" : "−"}${usd2(drift.moveRaw)}`}</span>
            <span className="sm-window">{SENSEI.meter.minutes(drift.spanMin)}</span>
          </>
        ) : null}
        <span className="sm-spacer" />
        {left !== null ? (
          <span className="sm-time">
            <span className="sm-time-num">{formatClock(left)}</span>
            <span className="sm-time-lab">{SENSEI.meter.left}</span>
          </span>
        ) : null}
      </div>
      <div className="sm-chart-wrap sm-chart-inset">
        <div className="mc-spark">
          <CardSpark points={points} openingRaw={openingRaw} />
        </div>
      </div>
    </div>
  );
}

/** Act on the read without leaving the drawer: a side hands the Window to the one ticket with that side chosen. */
function SenseiTradeCard({ market, onAct }: { market: EventMarket; onAct: (side: Side) => void }) {
  const [hidden, setHidden] = useState(false);
  const book = useTopOfBook(market);
  if (hidden) return null;
  const cents = (c: number | null) => (c === null ? "—" : `${c}¢`);
  return (
    <div className="sensei-trade">
      <div className="st-head">
        <span>{SENSEI.trade.head}</span>
        <div className="st-headright">
          <button type="button" className="st-hide" onClick={() => setHidden(true)} aria-label={SENSEI.trade.hide} title={SENSEI.trade.hide}>✕</button>
        </div>
      </div>
      <div className="st-list">
        <div className="st-card">
          <div className="st-cardhead">
            <span className="st-asset inline-flex items-center gap-2">
              <AssetDisc asset={market.asset} className="lane-chip-mark" />
              {market.asset} <b>{formatCadence(market.intervalSec)}</b>
            </span>
          </div>
          <div className="st-sides">
            {(["up", "down"] as const).map((side) => (
              <button key={side} type="button" className={cn("st-side", side)} onClick={() => onAct(side)}>
                <span className="st-sidetop">
                  <span className="st-sidelabel">{side === "up" ? SENSEI.trade.up : SENSEI.trade.down}</span>
                  <span className="st-sideprob">{cents(side === "up" ? book.upCents : book.downCents)}</span>
                </span>
                <span className="st-sidepay">{SENSEI.trade.pays}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface SenseiSheetProps {
  open: boolean;
  onClose: () => void;
  /** The figures on screen, read when a question is asked. */
  read: () => SenseiContext;
  market: EventMarket | null;
  openingRaw: bigint | null;
  /** Where a side goes once Sensei has read (Markets opens the ticket); absent, no trade card. */
  onAct?: (marketId: EventMarket["marketId"], side: Side) => void;
}

export function SenseiSheet({ open, onClose, read, market, openingRaw, onAct }: SenseiSheetProps) {
  const [status, setStatus] = useState<SenseiStatus | null | "loading">("loading");
  const consent = useAiConsent();
  const provider = status !== "loading" && status?.on ? status.provider : null;
  const chat = useSenseiChat(provider);
  const [pending, setPending] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  useKeyboardInset(asideRef, open);
  useEffect(() => void readStatus().then(setStatus), []);

  const agreed = consentCovers(consent, provider);
  const on = status !== "loading" && status !== null && status.on;
  const busy = chat.status !== "idle";
  const ask = (q: string) => {
    const text = q.trim();
    if (!text || busy || !on) return;
    if (agreed) void chat.ask(text, read());
    else setPending(text);
  };

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, chat.status, open, pending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const last = chat.messages.at(-1);
  const showChips = !busy && pending === null && chat.messages.length > 1 && last?.role === "assistant" && !last.failed;
  const hasRead = chat.messages.some((m, i) => i > 0 && m.role === "assistant" && !m.failed && m.content);

  return (
    <>
      <button type="button" className={cn("sensei-drawer-scrim", open && "show")} aria-label={SENSEI.close} tabIndex={-1} aria-hidden={!open} onClick={onClose} />
      <aside ref={asideRef} className={cn("sensei-drawer", open && "open")} role="dialog" aria-label={SENSEI.title} aria-modal={open} aria-hidden={!open}>
        <header className="sensei-drawer-head">
          <div>
            <div className="sd-eyebrow">{SENSEI.eyebrow}</div>
            <div className="sd-title">
              {SENSEI.title} <span className="sd-beta">{SENSEI.beta}</span>
            </div>
          </div>
          <div className="sd-head-right">
            <button type="button" className="sd-close" onClick={onClose} aria-label={SENSEI.close} title={SENSEI.close}>✕</button>
          </div>
        </header>

        <SenseiMeter market={market} openingRaw={openingRaw} />

        <div ref={scrollRef} className="sensei-drawer-msgs">
          {chat.messages.map((m, i) => {
            const writing = i === chat.messages.length - 1 && m.role === "assistant" && busy;
            return (
              <div key={i} className={cn("sd-row", m.role)}>
                {m.role === "assistant" ? (
                  <span className="sd-ava" aria-hidden>
                    <MitoshiMark className="sd-ava-mark" />
                  </span>
                ) : null}
                <div className={cn("sd-msg", m.role)}>
                  {writing && chat.status === "waiting" ? (
                    <span className="sensei-dots" aria-label={SENSEI.typing}><i /><i /><i /></span>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}{writing ? <span className="sd-caret" aria-hidden /> : null}</span>
                  )}
                </div>
              </div>
            );
          })}
          {status === "loading" ? <p role="status" className="sensei-drawer-foot">{SENSEI.checking}</p> : null}
          {status !== "loading" && !on ? <p className="sensei-drawer-foot">{status === null ? SENSEI.offline : SENSEI.off}</p> : null}
          {pending !== null && on && !agreed ? (
            <SenseiConsent
              recipients={status.recipients}
              onAgree={() => {
                grantAiConsent(status.provider!);
                const q = pending;
                setPending(null);
                void chat.ask(q, read());
              }}
              onDecline={() => (setPending(null), notify.item({ id: "sensei-consent", title: SENSEI.consent.declined }))}
            />
          ) : null}
          {showChips ? (
            <div className="sd-chips">
              {chipsFor(last.content).map((chip) => (
                <button key={chip} type="button" className="sd-chip" onClick={() => ask(chip)}>{chip}</button>
              ))}
            </div>
          ) : null}
        </div>

        {hasRead && market && onAct ? <SenseiTradeCard market={market} onAct={(side) => (onAct(market.marketId, side), onClose())} /> : null}

        {chat.messages.length <= 1 && pending === null && on ? (
          <div className="sensei-drawer-starters">
            {SENSEI_STARTERS.map((starter) => (
              <button key={starter} type="button" className="sd-starter" onClick={() => ask(starter)}>{starter}</button>
            ))}
          </div>
        ) : null}

        <form
          className="sensei-drawer-input"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return chat.stop();
            ask(input);
            setInput("");
          }}
        >
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={SENSEI.placeholder} aria-label={SENSEI.placeholder} disabled={!on || pending !== null} />
          <button type="submit" disabled={!on || pending !== null || (!busy && !input.trim())}>{busy ? SENSEI.stopShort : SENSEI.send}</button>
        </form>
        <p className="sensei-drawer-foot">
          {SENSEI.notAdvice}
          {agreed && on ? (
            <>
              {" "}{SENSEI.shared(status.recipients.join(", then "))}{" "}
              <button type="button" className="underline" onClick={() => (withdrawAiConsent(), notify.item({ id: "sensei-consent", title: SENSEI.turnedOff }))}>{SENSEI.turnOff}</button>
            </>
          ) : null}
        </p>
      </aside>
    </>
  );
}
