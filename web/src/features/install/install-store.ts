"use client";
/**
 * The install state, captured app-wide (ux-audit §8 PWA: `beforeinstallprompt` was only caught while `/download` was
 * mounted, so the prompt was usually gone by the time the reader got there). The listeners attach the first time any
 * component subscribes — `AppStrip`, mounted by every route — and hold the prompt for the session.
 */
import { installHintOf, type InstallHint } from "./browser";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface InstallSnapshot {
  /** Running installed, or inside the native app's web view. */
  installed: boolean;
  /** The browser offered its install prompt (Chromium). */
  canPrompt: boolean;
  ios: boolean;
  /** Something useful can be offered: a prompt, or the iOS share-sheet path. */
  canInstall: boolean;
  /** Where this browser keeps "install" when it holds no prompt (`browser.ts`). */
  hint: InstallHint;
}

const SERVER: InstallSnapshot = { installed: false, canPrompt: false, ios: false, canInstall: false, hint: "other" };
let snapshot: InstallSnapshot = SERVER;
let deferred: BeforeInstallPromptEvent | null = null;
let attached = false;
const listeners = new Set<() => void>();

function compute(): InstallSnapshot {
  const nav = navigator as Navigator & { standalone?: boolean };
  const w = window as unknown as { ReactNativeWebView?: unknown };
  const installed = window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true || w.ReactNativeWebView !== undefined;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return { installed, canPrompt: deferred !== null, ios, canInstall: !installed && (deferred !== null || ios), hint: ios ? "ios" : installHintOf(navigator.userAgent) };
}

function emit() {
  snapshot = compute();
  for (const l of listeners) l();
}

function attach() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", emit);
  snapshot = compute();
}

export function subscribeInstall(listener: () => void): () => void {
  attach();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const installSnapshot = (): InstallSnapshot => snapshot;
export const installServerSnapshot = (): InstallSnapshot => SERVER;

/** Opens the held prompt; the reader's choice, or null when none is held. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  if (!deferred) return null;
  try {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome;
  } catch {
    return null;
  }
}
