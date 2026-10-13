// Native feedback for the page (round 7, the owner's TestFlight review: "the sound is not playing at all"; Senryo
// apps/mobile/src/feedback/{sound,haptics}.ts is the model).
//   - Sound: the page's Web Audio plays through this app's audio session. Left at iOS's default (ambient), the
//     silent switch mutes every cue, so the session is set to playback once, mixing with the user's own audio. The
//     in-app Sound setting stays the control (the page doesn't play when it is off).
//   - Haptics: the page posts `haptic {kind}` (web/src/lib/haptics.ts) and the Taptic Engine plays it — the page's
//     own iOS trick (clicking a hidden switch) doesn't reach the engine from a web view.
import { setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import type { HapticKind } from "./haptic-kinds";

export function startAudioSession(): void {
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers", shouldPlayInBackground: false }).catch(() => undefined);
}

const { ImpactFeedbackStyle: Impact, NotificationFeedbackType: Note } = Haptics;

function pulse(times: number, gapMs: number, play: () => Promise<void>): void {
  for (let i = 0; i < times; i++) setTimeout(() => void play().catch(() => undefined), i * gapMs);
}

/** One haptic by the page's name for it; errors are swallowed (a haptic must never break a trade). */
export function playHaptic(kind: HapticKind): void {
  const go = (p: Promise<void>) => void p.catch(() => undefined);
  switch (kind) {
    case "tick":
      return go(Haptics.selectionAsync());
    case "tap":
      return go(Haptics.impactAsync(Impact.Light));
    case "move":
      return go(Haptics.impactAsync(Impact.Soft));
    case "open":
      return go(Haptics.impactAsync(Impact.Medium));
    case "close":
      return go(Haptics.impactAsync(Impact.Rigid));
    case "slump":
      return go(Haptics.impactAsync(Impact.Heavy));
    case "warn":
      return go(Haptics.notificationAsync(Note.Warning));
    case "surge":
      return pulse(3, 70, () => Haptics.impactAsync(Impact.Medium));
    case "mega":
      go(Haptics.notificationAsync(Note.Success));
      return pulse(3, 90, () => Haptics.impactAsync(Impact.Heavy));
  }
}
