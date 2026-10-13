// The page's haptic names (web/src/lib/haptics.ts `HapticKind`), kept apart from feedback.ts so the pure message
// parser (messages.ts) imports no native module.
export const HAPTIC_KINDS = ["tap", "tick", "open", "close", "move", "surge", "mega", "slump", "warn"] as const;
export type HapticKind = (typeof HAPTIC_KINDS)[number];
