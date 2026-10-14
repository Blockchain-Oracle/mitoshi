"use client";
// Ported from Owarine ecb7565b:web/src/lib/sound/trade.ts — the trading sounds, to Tradash's cue map (canton-season3
// tradash/SPEC-flow.md §2.9, SPEC-chart.md §5.3; revamp-parity RV-70/RV-71). Changed: only the six synthesised cues and
// the synth voices come over — Owarine's UGLYCASH flow clips (Kenney files) are not ported, so no audio file ships;
// mute is the Sound & Vibration setting (`lib/feedback.ts`), not a key of its own.
//
// The six cues — tap, open, close, win, loss, profit — are synthesised to the pitch contours and lengths measured from
// the reference's clips (SOUND-analysis.txt): our own audio, their character, nothing of theirs shipped. The combo
// ladder, surge, slump and adverse cues follow their synth code (same notes, envelopes, gains). Web Audio,
// "interactive" latency, unlocked on the first gesture, asleep between cues (`sleepSoon`: iOS reads a running context
// as live audio), resumed when the tab returns, rebuilt if the context gets
// stuck. Every error is swallowed: a sound must never break a trade.

export type TradeCue = "tap" | "open" | "close" | "win" | "loss" | "profit";

interface Voice {
  type: OscillatorType;
  from: number;
  to: number;
  at: number;
  dur: number;
  gain: number;
}

/** Cue gains, as the reference mixes them. */
const CUE_GAIN: Record<TradeCue, number> = { tap: 0.3, open: 0.55, close: 0.55, win: 0.5, loss: 0.4, profit: 0.35 };

/** Measured: tap ~1.1 kHz click 45 ms; open 735→1160 Hz; close 817→432 Hz; win 880/1100/1300 Hz at 0/80/160 ms; loss 848→566 Hz over an octave below; profit 1050 then 1300 Hz. */
const CUES: Record<TradeCue, Voice[]> = {
  tap: [
    { type: "sine", from: 1100, to: 1100, at: 0, dur: 0.045, gain: 0.9 },
    { type: "sine", from: 2200, to: 2200, at: 0, dur: 0.03, gain: 0.3 },
  ],
  open: [{ type: "sine", from: 735, to: 1160, at: 0, dur: 0.22, gain: 0.9 }],
  close: [{ type: "sine", from: 817, to: 432, at: 0, dur: 0.24, gain: 0.9 }],
  win: [
    { type: "sine", from: 880, to: 880, at: 0, dur: 0.11, gain: 0.85 },
    { type: "sine", from: 1102, to: 1102, at: 0.08, dur: 0.11, gain: 0.8 },
    { type: "sine", from: 1297, to: 1297, at: 0.16, dur: 0.16, gain: 0.9 },
  ],
  loss: [
    { type: "sine", from: 848, to: 566, at: 0, dur: 0.42, gain: 0.75 },
    { type: "sine", from: 424, to: 283, at: 0, dur: 0.42, gain: 0.2 },
  ],
  profit: [
    { type: "sine", from: 1050, to: 1050, at: 0, dur: 0.07, gain: 0.75 },
    { type: "sine", from: 1297, to: 1297, at: 0.04, dur: 0.1, gain: 0.7 },
  ],
};

/** The combo ladder: a major pentatonic over two octaves, one note up per favourable step. */
export const COMBO_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] as const;
const UNLOCK_EVENTS = ["touchend", "click", "keydown", "pointerup", "mousedown"] as const;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let installed = false;
let lastRebuildMs = 0;
let everRan = false;
let muted = false;
/** Suspended by `sleepSoon`, not by the system: a tap doesn't wake it, the next sound does. */
let asleep = false;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
/** Things that need the context running between cues (the music bed). */
let holds = 0;
/**
 * How long after the last cue ends the context sleeps. iOS shows a running context as live audio (the speaker in the
 * Dynamic Island, round 7 capture), so a silent page must not keep one running.
 */
const SLEEP_AFTER_MS = 1_500;

function sleepSoon(afterSec = 0): void {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    sleepTimer = null;
    if (holds === 0 && ctx && ctx.state === "running") {
      asleep = true;
      void ctx.suspend().catch(() => undefined);
    }
  }, afterSec * 1000 + SLEEP_AFTER_MS);
}

function wake(): void {
  asleep = false;
  if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => undefined);
}

function build(): boolean {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  try {
    const next = new Ctor({ latencyHint: "interactive" });
    next.onstatechange = () => {
      if (next.state === "running") everRan = true;
    };
    if (next.state === "running") everRan = true;
    out = next.createGain();
    out.gain.value = 1;
    out.connect(next.destination);
    ctx = next;
    return true;
  } catch {
    return false;
  }
}

/** A one-sample silent buffer: what iOS needs, inside a gesture, to let the context run. */
function blip(c: AudioContext): void {
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
    src.onended = () => src.disconnect();
  } catch {
    /* ignore */
  }
}

function rebuild(): void {
  const old = ctx;
  if (!build()) return;
  lastRebuildMs = Date.now();
  if (old && old.state !== "closed") void old.close().catch(() => undefined);
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => undefined);
}

/** Every gesture: a closed context is rebuilt; a suspended one is nudged, and rebuilt if it stays stuck. */
function unlock(): void {
  if (!ctx) {
    if (build()) {
      blip(ctx!);
      void ctx!.resume().catch(() => undefined);
      sleepSoon();
    }
    return;
  }
  // Asleep between cues by design: a tap leaves it be, and the next cue wakes it (sticky activation lets it).
  if (asleep && holds === 0) return;
  const c = ctx;
  if (c.state === "closed") {
    rebuild();
    if (ctx) blip(ctx);
    return;
  }
  if (c.state !== "running") {
    blip(c);
    void c.resume().catch(() => undefined);
    setTimeout(() => {
      if (ctx === c && everRan && c.state !== "running" && document.visibilityState === "visible" && Date.now() - lastRebuildMs > 1_500) rebuild();
    }, 400);
  }
}

function resume(): void {
  if (asleep && holds === 0) return;
  if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => undefined);
}

/** Keep the context running while something plays between cues (the music bed); returns the release. */
export function holdAudio(): () => void {
  holds += 1;
  wake();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds = Math.max(0, holds - 1);
    sleepSoon();
  };
}

/** Mount once (the feedback loader does). Idempotent; returns a teardown for tests and hot reload. */
export function installTradeSounds(isMuted: boolean): () => void {
  muted = isMuted;
  if (typeof window === "undefined" || installed) return () => undefined;
  installed = true;
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = "playback";
    } catch {
      /* ignore */
    }
  }
  for (const e of UNLOCK_EVENTS) window.addEventListener(e, unlock, { capture: true, passive: true });
  const onVisible = () => {
    if (document.visibilityState === "visible") resume();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    installed = false;
    for (const e of UNLOCK_EVENTS) window.removeEventListener(e, unlock, { capture: true });
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function voices(list: readonly Voice[], scale = 1, rate = 1): void {
  if (muted || !ctx || !out) return;
  wake();
  sleepSoon(Math.max(0, ...list.map((v) => v.at + v.dur)));
  try {
    const t0 = ctx.currentTime;
    for (const v of list) {
      const start = t0 + v.at;
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.from * rate, start);
      if (v.to !== v.from) osc.frequency.exponentialRampToValueAtTime(v.to * rate, start + v.dur);
      const g = ctx.createGain();
      const peak = Math.max(1e-4, v.gain * scale);
      g.gain.setValueAtTime(1e-4, start);
      g.gain.exponentialRampToValueAtTime(peak, start + 0.005);
      g.gain.exponentialRampToValueAtTime(1e-4, start + v.dur);
      osc.connect(g).connect(out);
      osc.start(start);
      osc.stop(start + v.dur + 0.02);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    }
  } catch {
    /* never let a sound break the flow */
  }
}

/** One cue by name. */
export function playTrade(cue: TradeCue): void {
  voices(CUES[cue], CUE_GAIN[cue]);
}

/** Win for pnl ≥ 0 (zero counts as a win), loss otherwise. */
export const playCloseOutcome = (pnl: number): void => playTrade(pnl >= 0 ? "win" : "loss");

/** The n-th consecutive favourable step: the profit cue pitched up the pentatonic ladder. */
export function playComboStep(n: number): void {
  const semis = COMBO_SEMITONES[Math.min(Math.max(1, n) - 1, COMBO_SEMITONES.length - 1)] ?? 0;
  voices(CUES.profit, CUE_GAIN.profit, 2 ** (semis / 12));
}

/** A soft falling blip from the second adverse step on. */
export const playAdverseStep = (): void => voices([{ type: "sine", from: 262, to: 196, at: 0, dur: 0.11, gain: 0.07 }]);

/** A move against the position: a long sine fall. */
export const playSlump = (): void => voices([{ type: "sine", from: 330, to: 130, at: 0, dur: 0.28, gain: 0.14 }]);

/** A move with the position: a triangle arpeggio C5 E5 G5 C6 (+E6 when mega), 45 ms apart. */
export function playSurge(mega: boolean): void {
  const notes = mega ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
  voices(notes.map((f, i) => ({ type: "triangle" as const, from: f, to: f, at: 0.045 * i, dur: 0.12, gain: mega ? 0.16 : 0.13 })));
}

/** The shared output, for the music engine. */
export function audioOutput(): { ctx: AudioContext; out: GainNode } | null {
  return ctx && out ? { ctx, out } : null;
}

export function setTradeMuted(next: boolean): void {
  muted = next;
}
