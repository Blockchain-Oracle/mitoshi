"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createChipBed, type ChipBed } from "./bed";

/**
 * Game audio: effects through Web Audio (decoded buffers, so rapid swipes overlap instead of cutting
 * each other off) and a music bed sequenced on the same clock (`bed.ts`). No dependency, no track.
 *
 * Flicky's grammar (`apps/web/src/lib/sound.ts`), re-implemented rather than copied: ten Kenney CC0
 * effects (`public/sounds/SOURCES.md`), unlocked on the first gesture, every load and play error
 * swallowed — a missing file must never break a game — and two independent persisted sliders (effects,
 * music) rather than one mute, so dragging either to zero is that channel's mute. On top of it, Pips's
 * discipline for controls (`components/console/consoleAudio.ts`): a press and its release are one
 * sample varied together — a fresh detune, gain and low-pass cut on the press, the same variation on
 * the release — and a press never sounds shorter than the floor.
 */
export type SfxName = "swipe-up" | "swipe-down" | "card-win" | "card-loss" | "match-found" | "duel-win" | "duel-lose" | "click" | "modal-open" | "modal-close";

export const SFX_FILES: Readonly<Record<SfxName, string>> = {
  "swipe-up": "/sounds/swipe-up.mp3",
  "swipe-down": "/sounds/swipe-down.mp3",
  "card-win": "/sounds/card-win.mp3",
  "card-loss": "/sounds/card-loss.mp3",
  "match-found": "/sounds/match-found.mp3",
  "duel-win": "/sounds/duel-win.mp3",
  "duel-lose": "/sounds/duel-lose.mp3",
  click: "/sounds/click.mp3",
  "modal-open": "/sounds/modal-open.mp3",
  "modal-close": "/sounds/modal-close.mp3",
};

/** The bed is ours, sequenced in `bed.ts`: Flicky's track is Uppbeat-licensed (a visible per-download credit), which is not ours to carry. */
export const BGM_BED = "chip" as const;

const SFX_VOLUME_KEY = "owarine.games.sfxVolume";
const BGM_VOLUME_KEY = "owarine.games.bgmVolume";
/** The sliders multiply these tuned levels: "100%" is the designed balance, not full amplitude. */
const SFX_VOLUME_BASE = 0.6;
const BGM_VOLUME_BASE = 0.3;
/** Pips: a press shorter than this still sounds this long, so a tap never clips its own release. */
export const PRESS_FLOOR_MS = 120;
/**
 * Pips's control profile, for the one control class here: how far a press may detune, how far from the
 * last press it must land (two identical clicks in a row read as a loop), and the gain and low-pass cut
 * it may take. A release reuses its press's variation at a lower gain.
 */
const PRESS = { centsRange: 60, minCentsChange: 18, gain: [0.7, 1] as const, cutoffHz: [2_400, 6_000] as const, releaseGain: 0.55 };

interface Variation {
  cents: number;
  gain: number;
  cutoffHz: number;
}

let sfxVolume = readVolume(SFX_VOLUME_KEY);
let bgmVolume = readVolume(BGM_VOLUME_KEY);
let unlocked = false;
let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let bed: ChipBed | null = null;
let bedGain: GainNode | null = null;
let bgmWanted = false;
let lastPress: Variation | null = null;
let pressedAtMs = 0;

const listeners = new Set<() => void>();
function emit(): void {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function readVolume(key: string): number {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw === null || raw === undefined ? 1 : clamp01(Number(raw));
  } catch {
    return 1;
  }
}

// ── unlock and the effects ──

/** One-time first-gesture unlock. Mount once, in the games shell; returns an uninstaller. Idempotent. */
export function installAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const off = () => {
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
  };
  const onGesture = () => {
    off();
    unlock();
  };
  window.addEventListener("pointerdown", onGesture);
  window.addEventListener("keydown", onGesture);
  return off;
}

function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  try {
    if (typeof AudioContext !== "undefined") {
      ctx = new AudioContext();
      sfxGain = ctx.createGain();
      sfxGain.gain.value = SFX_VOLUME_BASE * sfxVolume;
      sfxGain.connect(ctx.destination);
      void ctx.resume().catch(() => undefined);
      for (const name of Object.keys(SFX_FILES) as SfxName[]) void loadBuffer(name);
    }
  } catch {
    // no audio on this platform — stay silent
  }
  syncBgm();
}

async function loadBuffer(name: SfxName): Promise<void> {
  if (!ctx || buffers.has(name)) return;
  try {
    const response = await fetch(SFX_FILES[name]);
    buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()));
  } catch {
    // a missing or undecodable file: that one effect stays silent
  }
}

function source(name: SfxName): AudioBufferSourceNode | null {
  if (sfxVolume === 0 || !unlocked || !ctx || !sfxGain) return null;
  const buffer = buffers.get(name);
  if (!buffer) return null;
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  return node;
}

/**
 * The effects bus for a cue synthesized in code rather than played from a file (the arcade's): the
 * context and the gain the effects slider governs — or null when silenced, locked, or absent, so a
 * caller can build nothing rather than a graph nobody hears.
 */
export function sfxBus(): { ctx: AudioContext; out: GainNode } | null {
  if (sfxVolume === 0 || !unlocked || !ctx || !sfxGain) return null;
  return { ctx, out: sfxGain };
}

/** Fire and forget. A no-op when silenced, locked, or not yet loaded. */
export function playSfx(name: SfxName): void {
  try {
    const node = source(name);
    if (!node || !sfxGain) return;
    node.connect(sfxGain);
    node.start();
  } catch {
    // enhancement only
  }
}

/**
 * The context and the effects bus, for a voice built from oscillators rather than a sample (Lucky's
 * reels, `lucky/reel-sfx.ts`). Null while locked or silenced, so a synthesized cue obeys the same slider
 * and the same first-gesture unlock as every sample does.
 */
export function synthContext(): { ctx: AudioContext; out: AudioNode } | null {
  if (sfxVolume === 0 || !unlocked || !ctx || !sfxGain) return null;
  return { ctx, out: sfxGain };
}

// ── Pips's press and release ──

function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function nextVariation(previous: Variation | null): Variation {
  let cents = between(-PRESS.centsRange, PRESS.centsRange);
  if (previous && Math.abs(cents - previous.cents) < PRESS.minCentsChange) {
    cents = previous.cents + (cents >= previous.cents ? PRESS.minCentsChange : -PRESS.minCentsChange);
    cents = Math.max(-PRESS.centsRange, Math.min(PRESS.centsRange, cents));
  }
  return { cents, gain: between(PRESS.gain[0], PRESS.gain[1]), cutoffHz: between(PRESS.cutoffHz[0], PRESS.cutoffHz[1]) };
}

function playVaried(variation: Variation, gainScale: number): void {
  try {
    const node = source("click");
    if (!node || !ctx || !sfxGain) return;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    node.playbackRate.value = 2 ** (variation.cents / 1_200);
    filter.type = "lowpass";
    filter.frequency.value = variation.cutoffHz;
    gain.gain.value = variation.gain * gainScale;
    node.connect(filter).connect(gain).connect(sfxGain);
    node.start();
  } catch {
    // enhancement only
  }
}

/** The moment a control goes down. */
export function pressSfx(): void {
  lastPress = nextVariation(lastPress);
  pressedAtMs = Date.now();
  playVaried(lastPress, 1);
}

/** The moment it comes up — its press's own variation, quieter, and never before the floor. */
export function releaseSfx(): void {
  const variation = lastPress ?? nextVariation(null);
  const wait = Math.max(0, PRESS_FLOOR_MS - (Date.now() - pressedAtMs));
  const fire = () => playVaried(variation, PRESS.releaseGain);
  if (wait > 0) setTimeout(fire, wait);
  else fire();
}

// ── the bed ──

/** Request the music loop. Idempotent; respects the slider, the unlock and the tab's visibility. */
export function startBgm(): void {
  bgmWanted = true;
  syncBgm();
}

export function stopBgm(): void {
  bgmWanted = false;
  syncBgm();
}

/** The bed's own gain sits under the slider and beside the effects', on the context the unlock made. */
function ensureBed(): ChipBed | null {
  if (bed || !ctx) return bed;
  try {
    bedGain = ctx.createGain();
    bedGain.gain.value = BGM_VOLUME_BASE * bgmVolume;
    bedGain.connect(ctx.destination);
    bed = createChipBed(ctx, bedGain);
  } catch {
    bed = null;
  }
  return bed;
}

/** One reconciler: play exactly when wanted, unlocked, audible and visible. */
function syncBgm(): void {
  const hidden = typeof document !== "undefined" && document.hidden;
  if (bgmWanted && unlocked && bgmVolume > 0 && !hidden) ensureBed()?.start();
  else bed?.stop();
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", syncBgm);

// ── the two sliders, persisted ──

export function getSfxVolume(): number {
  return sfxVolume;
}

/** 0–1. Applies live; persisted across sessions. */
export function setSfxVolume(value: number): void {
  sfxVolume = clamp01(value);
  try {
    globalThis.localStorage?.setItem(SFX_VOLUME_KEY, String(sfxVolume));
  } catch {
    // storage unavailable — the level still applies for this session
  }
  if (sfxGain) sfxGain.gain.value = SFX_VOLUME_BASE * sfxVolume;
  emit();
}

export function useSfxVolume(): number {
  return useSyncExternalStore(subscribe, getSfxVolume, () => 1);
}

export function getBgmVolume(): number {
  return bgmVolume;
}

export function setBgmVolume(value: number): void {
  bgmVolume = clamp01(value);
  try {
    globalThis.localStorage?.setItem(BGM_VOLUME_KEY, String(bgmVolume));
  } catch {
    // storage unavailable — the level still applies for this session
  }
  if (bedGain) bedGain.gain.value = BGM_VOLUME_BASE * bgmVolume;
  syncBgm();
  emit();
}

export function useBgmVolume(): number {
  return useSyncExternalStore(subscribe, getBgmVolume, () => 1);
}

// ── dialogs ──

/** For a sheet or dialog driven by an `open` prop: the open and close chirps on transitions, silent at mount. */
export function useModalSfx(open: boolean): void {
  const previous = useRef(open);
  useEffect(() => {
    if (previous.current === open) return;
    previous.current = open;
    playSfx(open ? "modal-open" : "modal-close");
  }, [open]);
}
