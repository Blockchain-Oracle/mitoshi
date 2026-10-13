// Ported from Owarine 90a91d71:web/src/features/games/lucky/reel-sfx.ts (R4-9, D-227) — the reels' ratchet, thunks and stings.
"use client";

import { synthContext } from "../audio";

/**
 * The reels' voices, built from oscillators and filtered noise on the shared effects bus rather than
 * played from a file — Pips' grammar (`lib/sound.ts`: a spin-up sweep, a ratchet, a landing per reel
 * that climbs a chord, a confirm when the machine commits, and three stings for the verdict), written
 * again here in this app's own numbers. Kenney's set has no reel in it, and a slot with a sampled click
 * reads as a button, not a machine. Every voice obeys the effects slider and the first-gesture unlock,
 * because `synthContext` returns nothing until both are satisfied.
 */

const NOISE_SEC = 0.25;
let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * NOISE_SEC);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** A rounded mallet: a triangle under a low-pass with a faint, slightly sharp octave shimmer on top. */
function bell(ctx: AudioContext, out: AudioNode, hz: number, at: number, durSec: number, gain: number): void {
  const body = ctx.createOscillator();
  const shimmer = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  const shimmerGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  body.type = "triangle";
  shimmer.type = "sine";
  body.frequency.setValueAtTime(hz, at);
  shimmer.frequency.setValueAtTime(hz * 2.012, at);
  filter.type = "lowpass";
  filter.frequency.value = Math.min(hz * 5, 8_000);
  bodyGain.gain.setValueAtTime(0.0001, at);
  bodyGain.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + durSec);
  shimmerGain.gain.setValueAtTime(0.0001, at);
  shimmerGain.gain.exponentialRampToValueAtTime(gain * 0.2, at + 0.006);
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, at + durSec * 0.6);
  body.connect(filter).connect(bodyGain).connect(out);
  shimmer.connect(shimmerGain).connect(out);
  body.start(at);
  shimmer.start(at);
  body.stop(at + durSec + 0.05);
  shimmer.stop(at + durSec + 0.05);
}

function burst(ctx: AudioContext, out: AudioNode, at: number, shape: (filter: BiquadFilterNode, gain: GainNode) => number): void {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noise(ctx);
  const stopSec = shape(filter, gain);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
  source.stop(at + stopSec);
}

/** The reels take off: a band-passed sweep upward under a quick major triad. */
export function reelSpin(): void {
  const synth = synthContext();
  if (!synth) return;
  const { ctx, out } = synth;
  const at = ctx.currentTime;
  burst(ctx, out, at, (filter, gain) => {
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(300, at);
    filter.frequency.exponentialRampToValueAtTime(2_400, at + 0.24);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.03, at + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    return 0.32;
  });
  bell(ctx, out, 523.25, at, 0.14, 0.035);
  bell(ctx, out, 659.25, at + 0.05, 0.14, 0.035);
  bell(ctx, out, 783.99, at + 0.1, 0.18, 0.04);
}

/** One detent of the ratchet: a hair of band-passed noise, its centre jittered so a stream reads as a rolling reel. */
export function reelTick(): void {
  const synth = synthContext();
  if (!synth) return;
  const { ctx, out } = synth;
  const at = ctx.currentTime;
  burst(ctx, out, at, (filter, gain) => {
    filter.type = "bandpass";
    filter.Q.value = 1.6;
    filter.frequency.value = 1_600 + Math.random() * 1_000;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.012, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    return 0.04;
  });
}

const LOCK_NOTES = [880, 1_108.73, 1_318.51];

/** A reel lands: a body thunk, a detent click, and a mallet that climbs one note per reel; the last one rings and sparkles. */
export function reelLock(step: number, last: boolean): void {
  const synth = synthContext();
  if (!synth) return;
  const { ctx, out } = synth;
  const at = ctx.currentTime;
  const thunk = ctx.createOscillator();
  const thunkGain = ctx.createGain();
  thunk.type = "sine";
  thunk.frequency.setValueAtTime(190, at);
  thunk.frequency.exponentialRampToValueAtTime(90, at + 0.1);
  thunkGain.gain.setValueAtTime(0.0001, at);
  thunkGain.gain.exponentialRampToValueAtTime(0.05, at + 0.006);
  thunkGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
  thunk.connect(thunkGain).connect(out);
  thunk.start(at);
  thunk.stop(at + 0.15);
  burst(ctx, out, at, (filter, gain) => {
    filter.type = "highpass";
    filter.frequency.value = 3_400;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.02, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    return 0.05;
  });
  bell(ctx, out, LOCK_NOTES[Math.min(step, LOCK_NOTES.length - 1)] as number, at + 0.005, last ? 0.32 : 0.16, 0.05);
  if (last) bell(ctx, out, 1_760, at + 0.08, 0.24, 0.025);
}

/** The machine commits to its Window: a bright ascending confirm, clear of the reel chord. */
export function reelPick(): void {
  const synth = synthContext();
  if (!synth) return;
  const { ctx, out } = synth;
  const at = ctx.currentTime;
  bell(ctx, out, 987.77, at, 0.16, 0.045);
  bell(ctx, out, 1_318.51, at + 0.06, 0.18, 0.05);
  bell(ctx, out, 1_760, at + 0.12, 0.26, 0.055);
}

/** The verdict was a win: a sub boom under a two-octave climb and a twinkle on top. */
export function luckyWinSting(): void {
  const synth = synthContext();
  if (!synth) return;
  const { ctx, out } = synth;
  const at = ctx.currentTime;
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(96, at);
  sub.frequency.exponentialRampToValueAtTime(48, at + 0.5);
  subGain.gain.setValueAtTime(0.0001, at);
  subGain.gain.exponentialRampToValueAtTime(0.2, at + 0.01);
  subGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
  sub.connect(subGain).connect(out);
  sub.start(at);
  sub.stop(at + 0.72);
  [523.25, 659.25, 783.99, 1_046.5, 1_318.51, 1_567.98].forEach((hz, i) => bell(ctx, out, hz, at + 0.04 + i * 0.075, 0.42, 0.055));
  [2_093, 2_637.02, 1_975.53, 2_349.32].forEach((hz, i) => bell(ctx, out, hz, at + 0.52 + i * 0.07, 0.18, 0.02));
}

/** The verdict was a miss: a soft low sigh under a falling minor third. Brief, never a nag. */
export function luckyLoseSting(): void {
  const synth = synthContext();
  if (!synth) return;
  const { ctx, out } = synth;
  const at = ctx.currentTime;
  const sigh = ctx.createOscillator();
  const sighGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  sigh.type = "sine";
  sigh.frequency.setValueAtTime(220, at);
  sigh.frequency.exponentialRampToValueAtTime(150, at + 0.45);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1_200, at);
  filter.frequency.exponentialRampToValueAtTime(500, at + 0.4);
  sighGain.gain.setValueAtTime(0.0001, at);
  sighGain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
  sighGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  sigh.connect(filter).connect(sighGain).connect(out);
  sigh.start(at);
  sigh.stop(at + 0.58);
  bell(ctx, out, 329.63, at + 0.02, 0.3, 0.04);
  bell(ctx, out, 261.63, at + 0.16, 0.42, 0.04);
}
