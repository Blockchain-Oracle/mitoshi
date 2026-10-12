/**
 * The music bed, sequenced in code rather than played from a file.
 *
 * Flicky's bed is an Uppbeat track under a per-download credit that is not ours to carry, and no CC0
 * track was going to be the reference's either. So the bed is written the way Pips writes its game
 * audio (`reference/pips/web/src/lib/sound.ts`): oscillators and noise scheduled on the Web Audio clock,
 * a recipe re-implemented rather than a file copied. What plays is an eight-bar chiptune loop in
 * A minor — a pulse lead, a triangle bass, a filtered pad and a three-piece kit — at a tempo under the
 * swipe rather than driving it. It weighs nothing, loops without a seam, and its provenance is this file.
 *
 * Scheduling is the standard look-ahead: a short timer wakes every 25 ms and books every note that
 * starts inside the next 100 ms at its exact sample time, so a busy main thread cannot smear the beat.
 */

const BPM = 112;
const STEP_SEC = 60 / BPM / 4;
const BARS = 8;
const STEPS = BARS * 16;
const LOOKAHEAD_SEC = 0.1;
const TICK_MS = 25;

/** The four chords a bar each, twice: A minor, F, C, G — roots as MIDI, thirds as semitones. */
const CHORDS: readonly { root: number; third: number }[] = [
  { root: 57, third: 3 },
  { root: 53, third: 4 },
  { root: 48, third: 4 },
  { root: 55, third: 4 },
];

/** A bar of arpeggio, as indexes into [root, third, fifth, octave]; the second half of the loop answers with a motif. Null rests. */
const ARP: readonly (number | null)[] = [0, 1, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1];
const MOTIF: readonly (number | null)[] = [3, null, 2, null, 1, 2, null, 3, null, null, 2, 1, 0, null, 1, null];
/** A bar of bass, as semitones above the root an octave down. */
const BASS: readonly number[] = [0, 12, 0, 12, 0, 12, 7, 12];
/** The kit, per sixteenth: k kick, s snare, h hat, H accented hat, . nothing. */
const KIT = "kh.hsh.hkh.hshhh";

const midiHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

export interface ChipBed {
  start(): void;
  stop(): void;
}

export function createChipBed(ctx: AudioContext, out: AudioNode): ChipBed {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(out);

  // One filter each for the lead and the pad; the drums have their own per hit.
  const leadFilter = ctx.createBiquadFilter();
  leadFilter.type = "lowpass";
  leadFilter.frequency.value = 3_200;
  leadFilter.connect(master);
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.connect(master);

  // A second of white noise, made once, for the snare and the hat.
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

  let timer: ReturnType<typeof setInterval> | null = null;
  let step = 0;
  let nextAt = 0;

  function tone(type: OscillatorType, hz: number, at: number, dur: number, gain: number, to: AudioNode, detune = 0): void {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    osc.detune.value = detune;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.008);
    env.gain.setTargetAtTime(0, at + dur * 0.8, dur * 0.12);
    osc.connect(env).connect(to);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  function hit(at: number, kind: "k" | "s" | "h" | "H"): void {
    if (kind === "k") {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, at);
      osc.frequency.exponentialRampToValueAtTime(42, at + 0.11);
      env.gain.setValueAtTime(0.55, at);
      env.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      osc.connect(env).connect(master);
      osc.start(at);
      osc.stop(at + 0.2);
      return;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    src.buffer = noise;
    const snare = kind === "s";
    filter.type = snare ? "bandpass" : "highpass";
    filter.frequency.value = snare ? 1_800 : 7_500;
    const peak = snare ? 0.32 : kind === "H" ? 0.14 : 0.08;
    const dur = snare ? 0.12 : 0.04;
    env.gain.setValueAtTime(peak, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter).connect(env).connect(master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  function book(index: number, at: number): void {
    const bar = Math.floor(index / 16);
    const sixteenth = index % 16;
    const chord = CHORDS[bar % 4] as { root: number; third: number };
    const tones = [chord.root + 12, chord.root + 12 + chord.third, chord.root + 19, chord.root + 24];

    // The lead: an arpeggio for four bars, the motif for four, a square an octave up under a low-pass.
    const line = bar < 4 ? ARP : MOTIF;
    const pick = line[sixteenth];
    if (pick !== null && pick !== undefined) tone("square", midiHz(tones[pick] as number), at, STEP_SEC * 0.9, 0.07, leadFilter);

    // The bass on eighths, the octave bounce that every chiptune walks.
    if (sixteenth % 2 === 0) tone("triangle", midiHz(chord.root - 12 + (BASS[sixteenth / 2] as number)), at, STEP_SEC * 1.8, 0.22, master);

    // The pad: a bar-long chord from two detuned saws, quiet and dark.
    if (sixteenth === 0) {
      for (const note of [chord.root, chord.root + chord.third, chord.root + 7]) {
        tone("sawtooth", midiHz(note), at, STEP_SEC * 16, 0.028, padFilter, -6);
        tone("sawtooth", midiHz(note), at, STEP_SEC * 16, 0.028, padFilter, 6);
      }
    }

    const beat = KIT[sixteenth];
    if (beat === "k" || beat === "s" || beat === "h" || beat === "H") hit(at, beat);
    // A fill into the loop's turnaround: sixteenth hats across the last beat of bar eight.
    if (bar === 7 && sixteenth >= 12 && beat === ".") hit(at, "h");
  }

  function schedule(): void {
    while (nextAt < ctx.currentTime + LOOKAHEAD_SEC) {
      book(step, nextAt);
      nextAt += STEP_SEC;
      step = (step + 1) % STEPS;
    }
  }

  return {
    start() {
      if (timer) return;
      nextAt = Math.max(nextAt, ctx.currentTime + 0.05);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
      timer = setInterval(schedule, TICK_MS);
      schedule();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    },
  };
}
