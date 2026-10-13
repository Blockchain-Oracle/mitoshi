"use client";
// Ported from Owarine ecb7565b:web/src/lib/haptics.ts — Tradash's haptic table (canton-season3 tradash/SPEC-chart.md
// §6; revamp-parity RV-73). `navigator.vibrate` where it exists; on iPhone and iPad, which have no Vibration API, a
// hidden native switch is clicked 1–5 times 70 ms apart (iOS 18 plays its switch haptic for each). Gated by the
// Sound & Vibration setting (`lib/feedback.ts`); silent wherever neither works. Round 7: inside the phone app the
// shell's Taptic Engine plays it (the `haptic` bridge message).
export type HapticKind = "tap" | "tick" | "open" | "close" | "move" | "surge" | "mega" | "slump" | "warn";

const PATTERN: Record<HapticKind, number | number[]> = {
  tap: 8,
  tick: 3,
  open: [12, 20, 12],
  close: 20,
  move: 6,
  surge: [25, 35, 25, 35, 45],
  mega: [40, 30, 40, 30, 40, 30, 80],
  slump: 35,
  warn: [80, 60, 80],
};
const IOS_CLICKS: Record<HapticKind, number> = { tap: 1, tick: 1, open: 1, close: 1, move: 1, surge: 3, mega: 5, slump: 1, warn: 2 };
const IOS_GAP_MS = 70;

let enabled = true;
let iosSwitch: HTMLInputElement | null = null;

function isAppleTouch(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Mount once; pre-builds the iOS switch so the first haptic is not late. */
export function installHaptics(isEnabled: boolean): void {
  enabled = isEnabled;
  if (typeof document === "undefined" || iosSwitch || !isAppleTouch() || typeof navigator.vibrate === "function") return;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;left:-9999em;top:0;opacity:0;pointer-events:none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitch = input;
}

export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

export function haptic(kind: HapticKind): void {
  if (!enabled || typeof navigator === "undefined") return;
  try {
    // Inside the phone app the Taptic Engine plays it (round 7, mobile/src/shell/feedback.ts): the switch trick below
    // doesn't reach the engine from a web view, and Android's vibrator is coarser than its haptics.
    const shell = (window as unknown as { ReactNativeWebView?: { postMessage(m: string): void } }).ReactNativeWebView;
    if (shell) {
      shell.postMessage(JSON.stringify({ type: "haptic", kind }));
      return;
    }
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERN[kind]);
      return;
    }
    const input = iosSwitch;
    if (!input) return;
    for (let i = 0; i < IOS_CLICKS[kind]; i++) setTimeout(() => input.click(), i * IOS_GAP_MS);
  } catch {
    /* no haptics here */
  }
}
