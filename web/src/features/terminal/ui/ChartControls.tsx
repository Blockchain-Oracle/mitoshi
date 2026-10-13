"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/ui/ChartControls.tsx — CSS animations instead of motion for these
// small pieces; the music switch is the app-wide Sound & Vibration "music" (one setting, `lib/feedback.ts`) with the
// track kept in the terminal's settings; Mitoshi adds the depth toggle (the Markets hero's `HeroDepth`, a lazy island).
// R4-0 (D-227): the interval menu closes on a tap outside it or Escape (focus back on the pill), and tells the screen
// it is open (`onMenu`), which hides the settings stack that sat over 1m and 3m on a phone. R4-3 (D-227): Owarine's three —
// interval, line/candles, music (with its track chip) — plus one round ⋯ (`ChartMore`) holding Depth, Room, Sensei and
// Alerts, so a 320 px phone keeps one row of four; recentre still appears only when the candles are panned.
import { CandlestickChart, ChevronDown, Crosshair, LineChart, Music2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { setFeedback, tapFeedback, useFeedback } from "@/lib/feedback";
import { HOUR_INTERVALS, MINUTE_INTERVALS, type CandleInterval } from "../chart/candles";
import type { ChartHandle } from "../chart/LiveChart";
import { TERMINAL } from "../copy";
import { MUSIC_TRACKS, setTradeSettings, useTradeSettings } from "../settings";
import { ChartMore } from "./ChartMore";

const TRACK_NAMES = { arcade: "Arcade", rush: "Rush", night: "Night" } as const;

export function ChartControls({ handle, depthOn, onDepth, onRoom, onAlerts, onSensei, onMenu }: { handle: RefObject<ChartHandle | null>; depthOn: boolean; onDepth: (on: boolean) => void; onRoom?: () => void; onAlerts?: () => void; onSensei?: () => void; onMenu?: (open: boolean) => void }) {
  const settings = useTradeSettings();
  const feedback = useFeedback();
  const [menu, setMenu] = useState(false);
  const [chip, setChip] = useState(false);
  const [offCentre, setOffCentre] = useState(false);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<HTMLDivElement>(null);
  const candles = settings.chartView === "candles";

  useEffect(() => {
    onMenu?.(menu);
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!interval.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      interval.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [menu, onMenu]);

  useEffect(() => {
    void import("@/lib/sound/music").then((mu) => mu.setMusic(feedback.music, settings.musicTrack));
  }, [feedback.music, settings.musicTrack]);
  useEffect(() => {
    if (!candles) return setOffCentre(false);
    const id = setInterval(() => setOffCentre(handle.current?.offCentre() ?? false), 300);
    return () => clearInterval(id);
  }, [candles, handle]);

  const pick = (interval: CandleInterval) => {
    tapFeedback();
    setTradeSettings({ chartInterval: interval, chartView: "candles" });
    setMenu(false);
  };
  const showChip = () => {
    setChip(true);
    if (chipTimer.current) clearTimeout(chipTimer.current);
    chipTimer.current = setTimeout(() => setChip(false), 4_000);
  };

  return (
    <div className="tm-controls">
      <div className="tm-interval" ref={interval}>
        <button type="button" className={`tm-glass tm-ctl tm-ctl-pill${candles ? "" : " is-dim"}`} aria-label={TERMINAL.controls.interval(settings.chartInterval)} aria-expanded={menu} onClick={() => (tapFeedback(), setMenu((x) => !x))}>
          {settings.chartInterval}
          <ChevronDown aria-hidden className={menu ? "is-open" : undefined} />
        </button>
        {menu ? (
          <div className="tm-glass tm-popover" role="group" aria-label={TERMINAL.controls.intervals}>
            {([[TERMINAL.controls.minutes, MINUTE_INTERVALS], [TERMINAL.controls.hours, HOUR_INTERVALS]] as const).map(([title, list]) => (
              <div key={title}>
                <p className="tm-popover-title">{title}</p>
                <div className="tm-popover-grid">
                  {list.map((i) => (
                    <button key={i} type="button" className="tm-choice" aria-pressed={candles && settings.chartInterval === i} onClick={() => pick(i)}>{i}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="tm-glass tm-ctl" aria-label={candles ? TERMINAL.controls.toLine : TERMINAL.controls.toCandles} title={candles ? TERMINAL.controls.toLine : TERMINAL.controls.toCandles} onClick={() => (tapFeedback(), setTradeSettings({ chartView: candles ? "line" : "candles" }))}>
        {candles ? <LineChart aria-hidden /> : <CandlestickChart aria-hidden />}
      </button>
      <button
        type="button"
        className={`tm-glass tm-ctl${feedback.music ? " is-on" : ""}`}
        aria-label={feedback.music ? TERMINAL.controls.musicOff : TERMINAL.controls.musicOn}
        aria-pressed={feedback.music}
        onClick={() => {
          tapFeedback();
          setFeedback({ music: !feedback.music });
          if (!feedback.music) showChip();
        }}
      >
        {feedback.music ? <span aria-hidden className="tm-eq"><span /><span /><span /></span> : <Music2 aria-hidden />}
      </button>
      {chip && feedback.music ? (
        <button
          type="button"
          className="tm-glass tm-ctl-pill tm-track"
          onClick={() => {
            tapFeedback();
            setTradeSettings({ musicTrack: MUSIC_TRACKS[(MUSIC_TRACKS.indexOf(settings.musicTrack) + 1) % MUSIC_TRACKS.length]! });
            showChip();
          }}
        >
          ♪ {TRACK_NAMES[settings.musicTrack]} ›
        </button>
      ) : null}
      <ChartMore depthOn={depthOn} onDepth={onDepth} onRoom={onRoom} onSensei={onSensei} onAlerts={onAlerts} />
      {offCentre ? (
        <button type="button" className="tm-glass tm-ctl" aria-label={TERMINAL.controls.recentre} title={TERMINAL.controls.recentre} onClick={() => (tapFeedback(), handle.current?.recentre())}>
          <Crosshair aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
