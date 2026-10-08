// Ported from Owarine ecb7565b:web/src/lib/sound/music.ts — unchanged but for this header (S23f): the three tracks are sequenced
// in code (no audio files ship, DESIGN.md Feedback), on the trade engine's one AudioContext.
"use client";

import { audioOutput } from "./trade";

/**
 * The trading screen's music, to Tradash's behaviour (TRADASH-FIDELITY.md §Feedback — music): three looped tracks at
 * 0.32 gain with a 1.2 s fade-in and a 0.5 s crossfade between tracks, silent while the tab is hidden, and a "tense"
 * low-pass (900 Hz over 1.5 s, back over 0.6 s) while the open position is down 5 % or more. The tracks are ours,
 * sequenced in code on the Web Audio clock (the reference's are licensed files): a look-ahead timer books every note in
 * the next 100 ms at its exact time, so a busy main thread cannot smear the beat.
 */
export type MusicTrack = "arcade" | "rush" | "night";

interface Track {
  bpm: number;
  /** Chords a bar each: root MIDI and the third (3 minor, 4 major). */
  chords: ReadonlyArray<{ root: number; third: number }>;
  /** Lead per sixteenth as indexes into [root, third, fifth, octave]; null rests. */
  lead: ReadonlyArray<number | null>;
  leadType: OscillatorType;
  /** Bass per eighth, semitones above the root an octave down. */
  bass: readonly number[];
  /** Kit per sixteenth: k kick, s snare, h hat, . rest. */
  kit: string;
  gain: number;
}

const TRACKS: Record<MusicTrack, Track> = {
  arcade: {
    bpm: 112, chords: [{ root: 57, third: 3 }, { root: 53, third: 4 }, { root: 48, third: 4 }, { root: 55, third: 4 }],
    lead: [0, 1, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1], leadType: "square", bass: [0, 12, 0, 12, 0, 12, 7, 12], kit: "kh.hsh.hkh.hshhh", gain: 1,
  },
  rush: {
    bpm: 128, chords: [{ root: 52, third: 3 }, { root: 52, third: 3 }, { root: 48, third: 4 }, { root: 50, third: 4 }],
    lead: [0, null, 2, null, 3, null, 2, 0, null, 2, null, 3, 2, null, 1, null], leadType: "sawtooth", bass: [0, 0, 12, 0, 0, 12, 0, 7], kit: "khshkhshkhshkhsh", gain: 0.85,
  },
  night: {
    bpm: 92, chords: [{ root: 50, third: 3 }, { root: 46, third: 4 }, { root: 53, third: 4 }, { root: 48, third: 4 }],
    lead: [2, null, null, 1, null, null, 0, null, 3, null, null, 2, null, 1, null, null], leadType: "triangle", bass: [0, 0, 7, 0, 0, 12, 7, 0], kit: "k...s...k.k.s...", gain: 0.9,
  },
};

const MASTER_GAIN = 0.32;
const FADE_IN_SEC = 1.2;
const CROSSFADE_SEC = 0.5;
const LOOKAHEAD_SEC = 0.1;
const TICK_MS = 25;
const midiHz = (n: number) => 440 * 2 ** ((n - 69) / 12);

let master: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let trackBus: GainNode | null = null;
let current: MusicTrack | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextAt = 0;
let noise: AudioBuffer | null = null;
let wanted: { on: boolean; track: MusicTrack } = { on: false, track: "arcade" };
let visibilityBound = false;

function graph(): { ctx: AudioContext; out: AudioNode } | null {
  const o = audioOutput();
  if (!o) return null;
  if (!master || master.context !== o.ctx) {
    master = o.ctx.createGain();
    master.gain.value = 0;
    filter = o.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 20_000;
    master.connect(filter).connect(o.out);
    noise = o.ctx.createBuffer(1, o.ctx.sampleRate, o.ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return { ctx: o.ctx, out: master };
}

function note(ctx: AudioContext, to: AudioNode, type: OscillatorType, hz: number, at: number, dur: number, gain: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = hz;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.008);
  env.gain.setTargetAtTime(0, at + dur * 0.7, dur * 0.15);
  osc.connect(env).connect(to);
  osc.start(at);
  osc.stop(at + dur + 0.1);
  osc.onended = () => (osc.disconnect(), env.disconnect());
}

function hit(ctx: AudioContext, to: AudioNode, kind: string, at: number): void {
  if (kind === "k") {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    env.gain.setValueAtTime(0.5, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    osc.connect(env).connect(to);
    osc.start(at);
    osc.stop(at + 0.2);
    osc.onended = () => (osc.disconnect(), env.disconnect());
    return;
  }
  if (!noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = kind === "s" ? "bandpass" : "highpass";
  bp.frequency.value = kind === "s" ? 1_800 : 7_000;
  const env = ctx.createGain();
  const len = kind === "s" ? 0.12 : 0.04;
  env.gain.setValueAtTime(kind === "s" ? 0.22 : 0.07, at);
  env.gain.exponentialRampToValueAtTime(0.001, at + len);
  src.connect(bp).connect(env).connect(to);
  src.start(at, Math.random() * 0.5, len + 0.02);
  src.onended = () => (src.disconnect(), bp.disconnect(), env.disconnect());
}

function schedule(ctx: AudioContext, bus: GainNode, t: Track): void {
  const stepSec = 60 / t.bpm / 4;
  while (nextAt < ctx.currentTime + LOOKAHEAD_SEC) {
    const bar = Math.floor(step / 16) % t.chords.length;
    const s = step % 16;
    const chord = t.chords[bar]!;
    const tones = [chord.root, chord.root + chord.third, chord.root + 7, chord.root + 12];
    const lead = t.lead[s];
    if (lead !== null && lead !== undefined) note(ctx, bus, t.leadType, midiHz(tones[lead]! + 12), nextAt, stepSec * 0.9, 0.05 * t.gain);
    if (s % 2 === 0) note(ctx, bus, "triangle", midiHz(chord.root - 12 + (t.bass[s / 2] ?? 0)), nextAt, stepSec * 1.8, 0.16 * t.gain);
    if (s === 0) for (const n of tones.slice(0, 3)) note(ctx, bus, "sine", midiHz(n), nextAt, stepSec * 15, 0.025 * t.gain);
    const k = t.kit[s];
    if (k && k !== ".") hit(ctx, bus, k, nextAt);
    nextAt += stepSec;
    step += 1;
  }
}

function play(track: MusicTrack): void {
  const g = graph();
  if (!g || !master) return;
  const { ctx } = g;
  const now = ctx.currentTime;
  if (current && trackBus) {
    const old = trackBus;
    old.gain.setTargetAtTime(0, now, CROSSFADE_SEC / 3);
    setTimeout(() => old.disconnect(), CROSSFADE_SEC * 2000);
  } else {
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(MASTER_GAIN, now + FADE_IN_SEC);
  }
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, now);
  bus.gain.linearRampToValueAtTime(1, now + (current ? CROSSFADE_SEC : 0.05));
  bus.connect(master);
  trackBus = bus;
  current = track;
  step = 0;
  nextAt = now + 0.05;
  if (timer) clearInterval(timer);
  timer = setInterval(() => schedule(ctx, bus, TRACKS[track]), TICK_MS);
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  const o = audioOutput();
  if (master && o) {
    master.gain.cancelScheduledValues(o.ctx.currentTime);
    master.gain.setTargetAtTime(0, o.ctx.currentTime, 0.1);
  }
  current = null;
}

function apply(): void {
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (!wanted.on || hidden) return stop();
  if (current !== wanted.track || !timer) play(wanted.track);
}

/** On or off and which track; plays once the trade sounds' context is unlocked (the first gesture). */
export function setMusic(on: boolean, track: MusicTrack): void {
  wanted = { on, track };
  if (!visibilityBound && typeof document !== "undefined") {
    visibilityBound = true;
    document.addEventListener("visibilitychange", apply);
    for (const e of ["pointerup", "keydown", "touchend"]) window.addEventListener(e, () => wanted.on && !timer && apply(), { passive: true });
  }
  apply();
}

/** The tense low-pass while the position is losing 5 % or more. */
export function setMusicTense(tense: boolean): void {
  const o = audioOutput();
  if (!filter || !o) return;
  const now = o.ctx.currentTime;
  filter.frequency.cancelScheduledValues(now);
  filter.frequency.setValueAtTime(filter.frequency.value, now);
  filter.frequency.exponentialRampToValueAtTime(tense ? 900 : 20_000, now + (tense ? 1.5 : 0.6));
}

export const MUSIC_TRACK_NAMES: Record<MusicTrack, string> = { arcade: "Arcade", rush: "Rush", night: "Night" };
