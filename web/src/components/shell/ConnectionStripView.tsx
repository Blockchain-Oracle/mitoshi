"use client";
// One connection notice for the whole page (R6 shell S04/T05/T04; 21st 36542 syeddhasnainn/tool-error's anatomy — a
// status glyph, one line, a countdown and Retry — as a 32 px row with no card; 1641 ibelick/text-shimmer on
// "reconnecting"; Omio's one slim banner under the header, Coinbase's band over a list that keeps rendering). It is
// the top line's second row, so it is sticky with it on a phone: offline at once ("Offline — prices paused 15:31"),
// a failed read after 1.5 s with the next retry's countdown, gone on the first live read. The text is not a live
// region; the transitions are announced once each.
import { formatClock } from "@cwf/core/units";
import { WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useClockValue } from "@/lib/clock";
import { retryNow, useConnection } from "@/lib/connection";
import { CONNECTION } from "@/lib/connection-copy";
import { stripView } from "@/lib/connection-core";
import { cn } from "@/lib/utils";
import "@/styles/connection.css";

const C = CONNECTION;
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** Loaded by `ConnectionStrip` only when there is something to say. */
export default function ConnectionStripView() {
  const connection = useConnection();
  // A tick a second (the countdown, the 1.5 s threshold); 0 while prerendering, where no clock may be read.
  const tick = useClockValue((ms) => Math.floor(ms / 1000));
  const now = tick === 0 ? 0 : Date.now();
  const view = stripView(connection, now);
  const [said, setSaid] = useState<string | null>(null);
  const last = useRef(view.state);
  useEffect(() => {
    const prev = last.current;
    if (view.state === prev) return;
    last.current = view.state;
    if (view.state === "offline") setSaid(C.announce.offline);
    else if (view.state === "reconnecting" && prev === "hidden") setSaid(C.announce.reconnecting);
    else if (view.state === "hidden") setSaid(C.announce.live);
  }, [view.state]);

  const open = view.state !== "hidden";
  const text = view.state === "offline" ? C.offline(hhmm(view.sinceMs)) : view.state === "retrying" ? C.retrying : C.reconnecting;
  return (
    <div className="cs" data-open={open ? "" : undefined} data-state={view.state}>
      <div className="cs-inner">
        {open ? (
          <div className="cs-row" role="status">
            {view.state === "offline" ? <WifiOff aria-hidden className="cs-glyph" /> : <span aria-hidden className="cs-dot" />}
            <span id="cs-text" className={cn("cs-text", view.state !== "offline" && "cs-shimmer")}>{text}</span>
            {view.state === "reconnecting" ? (
              <span className="cs-count" title={`Attempt ${view.attempt + 1}`}>{formatClock(Math.max(0, Math.ceil((view.nextRetryAtMs - now) / 1000)))}</span>
            ) : null}
            {view.state !== "retrying" ? (
              <button type="button" className="cs-retry" aria-describedby="cs-text" onClick={retryNow}>{C.retry}</button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  );
}
