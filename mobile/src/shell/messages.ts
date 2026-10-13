// The messages a page sends the app (D-227, MOBILE; the D.3 envelope's types, version-less like the web's own
// `open-external`). Anything else, or anything malformed, is ignored. Pure: no React Native.
import { HAPTIC_KINDS, type HapticKind } from "./haptic-kinds";
export type WebMessage =
  | { type: "ready"; path: string }
  | { type: "theme"; mode: "dark" | "light" }
  | { type: "open-external"; url: string }
  | { type: "save-file"; name: string; mime: string; base64: string }
  // Round 7: a Taptic Engine haptic (web/src/lib/haptics.ts), and the Face ID lock setting (Settings, onboarding).
  | { type: "haptic"; kind: HapticKind }
  | { type: "face-id"; enabled: boolean }
  | { type: "face-id-state" };

/** 64 KB (D.3) for every message but a file, which may carry a share card PNG (about a megabyte in base64). */
const MAX_MESSAGE = 64 * 1024;
const MAX_FILE = 16 * 1024 * 1024;

const str = (value: unknown): value is string => typeof value === "string";

export function parseMessage(data: string): WebMessage | null {
  if (data.length > MAX_FILE) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.type === "save-file") {
    return str(m.name) && str(m.mime) && str(m.base64) ? { type: "save-file", name: m.name, mime: m.mime, base64: m.base64 } : null;
  }
  if (data.length > MAX_MESSAGE) return null;
  if (m.type === "ready") return { type: "ready", path: str(m.path) ? m.path : "/" };
  if (m.type === "theme") return m.mode === "dark" || m.mode === "light" ? { type: "theme", mode: m.mode } : null;
  if (m.type === "open-external") return str(m.url) ? { type: "open-external", url: m.url } : null;
  if (m.type === "haptic") return (HAPTIC_KINDS as readonly unknown[]).includes(m.kind) ? { type: "haptic", kind: m.kind as HapticKind } : null;
  if (m.type === "face-id") return typeof m.enabled === "boolean" ? { type: "face-id", enabled: m.enabled } : null;
  if (m.type === "face-id-state") return { type: "face-id-state" };
  return null;
}

/** A file name safe for the cache directory: no path, no control characters, never empty. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return clean.length > 0 ? clean.slice(0, 120) : "mitoshi";
}
