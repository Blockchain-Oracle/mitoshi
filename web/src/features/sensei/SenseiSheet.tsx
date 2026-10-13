"use client";
// Sensei (round 7, the owner's TestFlight review: "I don't like the way you did the Sensei AI"). Was Owarine's desktop
// chat drawer (D-226) — eyebrow, meter and spark, a thread, starters, a trade card, a consent wall before the first
// question — squeezed onto a phone. Now the app's own sheet (`SlideOver`: drag to dismiss, the keyboard lifts the
// composer, a right drawer from 768 px) built around one action and one answer:
//   · the Window in one line — price, how far from the line, time left;
//   · one big "Read BTC 5m", the sharing said beside it the first time (tapping it is the agreement: no wall), two
//     other questions under it;
//   · the answer as a card: the lean (Leans UP / Leans DOWN / Sit this one out) from the prompt's protocol line
//     (`lean.ts`), the why under it, and the two sides with their prices — on Markets a side opens the ticket, on the
//     terminal it is picked on the chart; Sensei never places a call;
//   · follow-ups as chips; the composer pinned in the sheet's foot with the not-advice line.
import { formatCadence, type EventMarket, type Side } from "@cwf/core";
import { formatClock } from "@cwf/core/units";
import { ArrowUp, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { useChartSeries } from "@/features/markets/data/useChartSeries";
import { useTopOfBook } from "@/features/markets/data/useTopOfBook";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { usd2 } from "@/features/markets/units";
import { useClockValue } from "@/lib/clock";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { consentCovers, grantAiConsent, useAiConsent } from "./consent";
import { chipsFor, SENSEI, SENSEI_INTRO, SENSEI_STARTERS } from "./copy";
import { splitLean, type Lean } from "./lean";
import type { SenseiContext, SenseiStatus } from "./protocol";
import { useSenseiChat } from "./useSenseiChat";
import "@/styles/sensei.css";

let statusOnce: Promise<SenseiStatus | null> | null = null;
const readStatus = () =>
  (statusOnce ??= fetch("/api/sensei", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SenseiStatus>) : null))
    .catch(() => null)
    .then((s) => (s === null && (statusOnce = null), s)));

const windowName = (m: EventMarket | null) => (m ? `${m.asset} ${formatCadence(m.intervalSec)}` : null);

/** The Window in one line: the price, how far it sits from the line, the time left. */
function WindowLine({ market, openingRaw }: { market: EventMarket | null; openingRaw: bigint | null }) {
  const series = useChartSeries(market);
  const latestRaw = (series?.ok ? series.value.points.at(-1)?.valueRaw : null) ?? null;
  const nowSec = useClockValue((ms) => Math.floor(ms / 1000));
  const left = market && nowSec > 0 ? Math.max(0, market.expirySec - nowSec) : null;
  const gap = latestRaw !== null && openingRaw !== null ? latestRaw - openingRaw : null;
  if (!market) return null;
  return (
    <div className={cn("sn-window", gap !== null && (gap > 0n ? "is-over" : gap < 0n ? "is-under" : null), left !== null && left <= 60 && "is-urgent")}>
      <AssetDisc asset={market.asset} className="sn-window-disc" />
      <span className="sn-window-name">{windowName(market)}</span>
      <span className="sn-window-price">{latestRaw === null ? SENSEI.meter.reading : usd2(latestRaw)}</span>
      {gap !== null ? (
        <span className="sn-window-gap">
          {gap === 0n ? SENSEI.meter.on : `${gap > 0n ? "▲" : "▼"} ${usd2(gap)} ${gap > 0n ? SENSEI.meter.over : SENSEI.meter.under}`}
        </span>
      ) : null}
      {left !== null ? <span className="sn-window-left">{formatClock(left)} {SENSEI.meter.left}</span> : null}
    </div>
  );
}

/** The read: the lean as the head, the why, the two sides to act on. */
function ReadCard({ lean, body, writing, market, onAct }: { lean: Lean; body: string; writing: boolean; market: EventMarket | null; onAct?: (side: Side) => void }) {
  const book = useTopOfBook(market);
  const price = (c: number | null) => (c === null ? "—" : `${c}¢`);
  return (
    <article className={cn("sn-read", `is-${lean}`)}>
      <header className="sn-read-head">
        <span className="sn-read-lean">{SENSEI.lean[lean]}</span>
        {market ? <span className="sn-read-window">{windowName(market)}</span> : null}
      </header>
      <p className="sn-read-why">
        {body}
        {writing ? <span className="sn-caret" aria-hidden /> : null}
      </p>
      {onAct && market && lean !== "sit" && !writing ? (
        <div className="sn-read-act">
          {(["up", "down"] as const).map((side) => (
            <button key={side} type="button" className={cn("sn-side", side, side === lean && "is-lean")} onClick={() => (haptic("tap"), onAct(side))}>
              <span>{SENSEI.act[side]}</span>
              <span className="sn-side-price">{price(side === "up" ? book.upCents : book.downCents)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Answer({ content, writing, waiting, failed, market, onAct }: { content: string; writing: boolean; waiting: boolean; failed?: true; market: EventMarket | null; onAct?: (side: Side) => void }) {
  const split = splitLean(content);
  if (failed) return <p className="sn-failed">{content}</p>;
  if (waiting || (writing && split.pending)) {
    return (
      <span className="sn-dots" role="status" aria-label={SENSEI.typing}>
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (split.lean) return <ReadCard lean={split.lean} body={split.body} writing={writing} market={market} onAct={onAct} />;
  return (
    <div className="sn-answer">
      <MitoshiMark className="sn-answer-mark" />
      <p>
        {split.body}
        {writing ? <span className="sn-caret" aria-hidden /> : null}
      </p>
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
  /** What a side on the read does: Markets opens the ticket with it chosen, the terminal picks it on the chart. */
  onAct?: (marketId: EventMarket["marketId"], side: Side) => void;
  /** Context chips under the Window line (the terminal's crowd and next report). */
  cells?: ReactNode;
}

export function SenseiSheet({ open, onClose, read, market, openingRaw, onAct, cells }: SenseiSheetProps) {
  const [status, setStatus] = useState<SenseiStatus | null | "loading">("loading");
  const consent = useAiConsent();
  const provider = status !== "loading" && status?.on ? status.provider : null;
  const chat = useSenseiChat(provider);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => void readStatus().then(setStatus), []);

  const on = status !== "loading" && status !== null && status.on;
  const agreed = consentCovers(consent, provider);
  const busy = chat.status !== "idle";
  // The sharing is said beside the read until it is agreed; asking is the agreement (round 7: no consent wall).
  const ask = (q: string) => {
    const text = q.trim();
    if (!text || busy || !on || !provider) return;
    if (!agreed) grantAiConsent(provider);
    haptic("tick");
    void chat.ask(text, read());
  };

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat.messages, chat.status, open]);

  const thread = chat.messages.filter((m) => m !== SENSEI_INTRO);
  const last = thread.at(-1);
  const lastSplit = last?.role === "assistant" && !last.failed ? splitLean(last.content) : null;
  const name = windowName(market);
  const act = onAct && market ? (side: Side) => onAct(market.marketId, side) : undefined;

  return (
    <SlideOver open={open} onOpenChange={(o) => !o && onClose()}>
      <SlideOverContent
        title={
          <span className="sn-title">
            {SENSEI.title}
            <span className="sn-beta">{SENSEI.beta}</span>
          </span>
        }
        fields
        bodyClassName="sn-body"
        footer={
          <>
            <form
              className="sn-compose"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return chat.stop();
                ask(input);
                setInput("");
              }}
            >
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={SENSEI.placeholder} aria-label={SENSEI.placeholder} disabled={!on} enterKeyHint="send" />
              <button type="submit" className="sn-send" disabled={!on || (!busy && !input.trim())} aria-label={busy ? SENSEI.stop : SENSEI.send}>
                {busy ? <Square aria-hidden className="size-3.5" fill="currentColor" /> : <ArrowUp aria-hidden className="size-4" />}
              </button>
            </form>
            <p className="sn-foot">{SENSEI.notAdvice}</p>
          </>
        }
      >
        <WindowLine market={market} openingRaw={openingRaw} />
        {cells ? <div className="sn-cells">{cells}</div> : null}

        {thread.length === 0 ? (
          <section className="sn-start">
            <p className="sn-lead">{SENSEI_INTRO.content}</p>
            {status === "loading" ? <p role="status" className="sn-note">{SENSEI.checking}</p> : null}
            {status !== "loading" && !on ? <p className="sn-note">{status === null ? SENSEI.offline : SENSEI.off}</p> : null}
            {on ? (
              <>
                <button type="button" className="sn-read-btn" onClick={() => ask(name ? SENSEI.read(name) : SENSEI.readAny)}>
                  {name ? SENSEI.read(name) : SENSEI.readAny}
                </button>
                {!agreed ? (
                  <p className="sn-sharing">
                    {SENSEI.sharing(status.recipients.join(", then "))}{" "}
                    <Link href={SENSEI.consent.whatHref}>{SENSEI.consent.whatLink}</Link>
                  </p>
                ) : null}
                <div className="sn-chips">
                  {SENSEI_STARTERS.map((starter) => (
                    <button key={starter} type="button" className="sn-chip" onClick={() => ask(starter)}>{starter}</button>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <div className="sn-thread">
            {thread.map((m, i) => {
              const isLast = i === thread.length - 1;
              return m.role === "user" ? (
                <p key={i} className="sn-q">{m.content}</p>
              ) : (
                <Answer key={i} content={m.content} failed={m.failed} writing={isLast && busy} waiting={isLast && chat.status === "waiting"} market={market} onAct={act} />
              );
            })}
            {!busy && lastSplit && on ? (
              <div className="sn-chips">
                {chipsFor(lastSplit.body, lastSplit.lean).map((chip) => (
                  <button key={chip} type="button" className="sn-chip" onClick={() => ask(chip)}>{chip}</button>
                ))}
                {name ? <button type="button" className="sn-chip" onClick={() => ask(SENSEI.readAgain(name))}>{SENSEI.readAgain(name)}</button> : null}
              </div>
            ) : null}
          </div>
        )}
        <div ref={endRef} />
      </SlideOverContent>
    </SlideOver>
  );
}
