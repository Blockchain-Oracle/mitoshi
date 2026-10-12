"use client";

import { sfxBus } from "../audio";

/**
 * The arcade's sounds, synthesized on the shared effects bus rather than played from files — Pips's
 * discipline (`lib/sound.ts`), re-written in this bed's key. Everything sits under the effects slider
 * and the first-gesture unlock, and a bus that is silent, locked or absent builds nothing.
 *
 * Candle Hop: a "tuiing" on every gap — a fast upward portamento on a triangle with a shimmer an
 * octave up — pitched a little higher for each gap in the streak, a climb of a fifth across forty gaps
 * and then held; a crash of two detuned saws sliding down under a closing filter with a sub thud.
 * Line Rider: a rising airy sweep under a bloom as the line flows in; a tick as the combo crosses a
 * whole number, brighter as it climbs; a soft blip on finding the line again; and the wipeout — the
 * floor drops out under a tumble down the scale. All in A minor, where the bed lives.
 */
const HOP_BASE_HZ = 783.99;
const HOP_CLIMB_OCTAVES = 0.75;
const HOP_STREAK_CAP = 40;
/** A4 C5 E5 A5: the run's opening lift. */
const BLOOM_HZ = [440, 523.25, 659.25, 880] as const;
/** A5 G5 E5 C5 A4: the wipeout's fall. */
const TUMBLE_HZ = [880, 783.99, 659.25, 523.25, 440] as const;
const MILESTONE_BASE_HZ = 1046.5;

let noise: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** One oscillator with an attack and an exponential release. */
function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, hz: number, at: number, dur: number, peak: number, detune = 0): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(hz, at);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Filtered noise with a sweep: the whoosh of a takeoff, the exhale of a fall. */
function sweep(ctx: AudioContext, out: AudioNode, type: BiquadFilterType, fromHz: number, toHz: number, at: number, dur: number, peak: number): void {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = noiseBuffer(ctx);
  filter.type = type;
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(fromHz, at);
  filter.frequency.exponentialRampToValueAtTime(toHz, at + dur * 0.8);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + dur * 0.3);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(at);
  src.stop(at + dur + 0.05);
}

function safely(fn: (ctx: AudioContext, out: AudioNode, at: number) => void): void {
  const bus = sfxBus();
  if (!bus) return;
  try {
    fn(bus.ctx, bus.out, bus.ctx.currentTime);
  } catch {
    // enhancement only: a cue that fails to build costs nothing
  }
}

/** A gap cleared, the `streak`th in a row (0-based). */
export function hopScoreSfx(streak: number): void {
  safely((ctx, out, t) => {
    const climb = Math.min(streak, HOP_STREAK_CAP) / HOP_STREAK_CAP;
    const hz = HOP_BASE_HZ * 2 ** (HOP_CLIMB_OCTAVES * climb);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(hz * 0.86, t);
    osc.frequency.exponentialRampToValueAtTime(hz, t + 0.05);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.18);
    tone(ctx, out, "sine", hz * 2, t + 0.012, 0.1, 0.04);
  });
}

/** The hop's crash: two saws a fifth apart sliding down under a closing filter, and a thud beneath. */
export function hopCrashSfx(): void {
  safely((ctx, out, t) => {
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1_800, t);
    filter.frequency.exponentialRampToValueAtTime(260, t + 0.55);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    filter.connect(env).connect(out);
    for (const [hz, detune] of [
      [330, -7],
      [494, 7],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(hz, t);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.66, t + 0.5);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.64);
    }
    thud(ctx, out, t, 0.22);
  });
}

function thud(ctx: AudioContext, out: AudioNode, t: number, peak: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.58);
}

/** The line flows in: an airy rising sweep under a soft bloom up the chord. */
export function rideStartSfx(): void {
  safely((ctx, out, t) => {
    sweep(ctx, out, "bandpass", 300, 2_600, t, 0.6, 0.08);
    BLOOM_HZ.forEach((hz, i) => tone(ctx, out, "sine", hz, t + 0.05 + i * 0.06, 0.5, 0.06));
  });
}

/** The wipeout: the floor drops out under a tumble down the scale and an exhale through a closing filter. */
export function rideCrashSfx(): void {
  safely((ctx, out, t) => {
    thud(ctx, out, t, 0.26);
    TUMBLE_HZ.forEach((hz, i) => tone(ctx, out, "sine", hz, t + 0.04 + i * 0.07, 0.3, 0.07));
    sweep(ctx, out, "lowpass", 2_600, 300, t, 0.55, 0.06);
  });
}

/** The combo crossed `mult`: a short bright tick, a semitone higher for each whole number, capped an octave up. */
export function milestoneSfx(mult: number): void {
  safely((ctx, out, t) => {
    const steps = Math.min(12, Math.max(0, Math.floor(mult) - 2));
    const hz = MILESTONE_BASE_HZ * 2 ** (steps / 12);
    tone(ctx, out, "square", hz, t, 0.09, 0.05);
    tone(ctx, out, "sine", hz * 2, t + 0.01, 0.07, 0.03);
  });
}

/** Back on the line: a soft, low blip — a haptic with a voice, not a chime. */
export function regainSfx(): void {
  safely((ctx, out, t) => tone(ctx, out, "triangle", 440, t, 0.06, 0.05));
}
