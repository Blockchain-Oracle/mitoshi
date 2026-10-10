"use client";
/**
 * What this device tells you about (S13 step 7, `/settings/notifications`; plan: topics grouped Money moved / Social /
 * Games, money on by default): the notification centre lists everything either way; these choose what is announced as a
 * toast and a browser notification. Kept on the device; the app's push (SM2) keeps its own copy server-side.
 */
import { useSyncExternalStore } from "react";

export interface NoticeTopics {
  /** Your calls filled, settled, voided and paid. */
  money: boolean;
  /** Your price alerts (rules you set yourself). */
  alerts: boolean;
  /** New followers and takes by people you follow. */
  social: boolean;
  /** Duels and game results (S12). */
  games: boolean;
}

const KEY = "mitoshi.noticeTopics";
const DEFAULTS: NoticeTopics = { money: true, alerts: true, social: false, games: false };
let current: NoticeTopics | null = null;
const listeners = new Set<() => void>();

function load(): NoticeTopics {
  if (current) return current;
  try {
    current = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<NoticeTopics>) };
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}

export function setNoticeTopics(next: Partial<NoticeTopics>): void {
  current = { ...load(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const useNoticeTopics = () => useSyncExternalStore(subscribe, load, () => DEFAULTS);
