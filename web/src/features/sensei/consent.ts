"use client";
/**
 * AI data-sharing consent (S13 step 8; D34, App Review 5.1.2(i)): before the first question reaches a model, the person
 * is told which provider receives what and agrees. The agreement is kept on this device for one provider: a change of
 * provider (the server's configuration) asks again. The route refuses a question without it, so the gate is enforced on
 * the server too. `/settings/account` (step 10) withdraws it.
 */
import { useSyncExternalStore } from "react";
import { SENSEI_CONSENT_VERSION } from "./stream";

export interface AiConsent {
  version: string;
  /** The provider agreed to, as the server names it ("anthropic"). */
  provider: string;
  atMs: number;
}

const KEY = "mitoshi.aiConsent";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: AiConsent | null } = { raw: null, value: null };

function read(): AiConsent | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cached.value;
  }
  if (raw === cached.raw) return cached.value;
  let value: AiConsent | null = null;
  try {
    const v = raw ? (JSON.parse(raw) as Partial<AiConsent>) : null;
    if (v && typeof v.version === "string" && typeof v.provider === "string" && typeof v.atMs === "number") value = { version: v.version, provider: v.provider, atMs: v.atMs };
  } catch {
    value = null;
  }
  cached = { raw, value };
  return value;
}

function write(value: AiConsent | null): void {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the agreement lasts for this visit
    cached = { raw: cached.raw, value };
  }
  listeners.forEach((l) => l());
}

export const grantAiConsent = (provider: string) => write({ version: SENSEI_CONSENT_VERSION, provider, atMs: Date.now() });
export const withdrawAiConsent = () => write(null);

/** True when the stored agreement covers this provider at the current version. */
export const consentCovers = (c: AiConsent | null, provider: string | null): c is AiConsent => c !== null && provider !== null && c.version === SENSEI_CONSENT_VERSION && c.provider === provider;

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => (e.key === null || e.key === KEY) && l();
  window.addEventListener("storage", onStorage);
  return () => (listeners.delete(l), window.removeEventListener("storage", onStorage));
};
export const useAiConsent = () => useSyncExternalStore(subscribe, read, () => null);
