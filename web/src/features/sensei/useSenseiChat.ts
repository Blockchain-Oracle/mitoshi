"use client";
/**
 * Sensei's thread on the client (S13 step 8; Agari 03b30ab `useSenseiChat`, now streamed): one thread per tab, kept
 * while the drawer closes and reopens; a question posts the last turns, the figures on screen and the consent, and the
 * answer is read line by line as the model writes it (`stream.ts`). Stop aborts the read and keeps what arrived. A
 * failure is a notice in the thread, never sent back to the model.
 */
import { useCallback, useSyncExternalStore } from "react";
import { SENSEI, SENSEI_INTRO } from "./copy";
import type { SenseiContext, SenseiMessage, SenseiRequest } from "./protocol";
import { SENSEI_CONSENT_VERSION, takeEvents } from "./stream";

/** The server keeps 12 turns; the client sends no more. */
const MAX_TURNS = 12;
export const MAX_QUESTION = 4_000;
/** Three questions inside a minute reads as rushing: the tilt cue Sensei's brake listens for. */
const RESTLESS_ASKS = 3;
const RESTLESS_MS = 60_000;

interface Thread {
  messages: SenseiMessage[];
  /** The assistant turn being written: "waiting" before its first token. */
  status: "idle" | "waiting" | "streaming";
}

let thread: Thread = { messages: [SENSEI_INTRO], status: "idle" };
let controller: AbortController | null = null;
const asks: number[] = [];
const listeners = new Set<() => void>();

/** Read through a function: a module `let` narrowed before an `await` would otherwise stay narrowed after it. */
const snapshot = (): Thread => thread;

function set(next: Partial<Thread>): void {
  thread = { ...thread, ...next };
  listeners.forEach((l) => l());
}

/** Rewrites the last message (the answer being written). */
function patchLast(fn: (m: SenseiMessage) => SenseiMessage | null): void {
  const last = thread.messages.at(-1);
  if (!last || last.role !== "assistant") return;
  const next = fn(last);
  set({ messages: next ? [...thread.messages.slice(0, -1), next] : thread.messages.slice(0, -1) });
}

const fail = (text: string) => {
  const last = thread.messages.at(-1);
  // Words already written stay; the notice follows them.
  if (last?.role === "assistant" && last.content) set({ messages: [...thread.messages, { role: "assistant", content: text, failed: true }] });
  else patchLast(() => ({ role: "assistant", content: text, failed: true }));
};

export async function askSensei(question: string, context: SenseiContext, provider: string): Promise<void> {
  if (thread.status !== "idle") return;
  const text = question.trim().slice(0, MAX_QUESTION);
  if (!text) return;
  const now = Date.now();
  asks.push(now);
  while (asks.length && now - asks[0]! > RESTLESS_MS) asks.shift();
  // The intro and failure notices are the page's, not the conversation's.
  const history = thread.messages.filter((m) => m !== SENSEI_INTRO && !m.failed && m.content);
  const turns = [...history, { role: "user" as const, content: text }].slice(-MAX_TURNS);
  set({ messages: [...thread.messages, { role: "user", content: text }, { role: "assistant", content: "" }], status: "waiting" });

  const body: SenseiRequest = { ...context, messages: turns.map(({ role, content }) => ({ role, content })), consent: { version: SENSEI_CONSENT_VERSION, provider }, restless: asks.length >= RESTLESS_ASKS };
  controller = new AbortController();
  try {
    const res = await fetch("/api/sensei", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok || !res.body) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return fail(json.error ?? SENSEI.offline);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const { events, rest } = takeEvents(buffer + decoder.decode(value, { stream: true }));
      buffer = rest;
      for (const e of events) {
        if (e.t === "delta") {
          if (snapshot().status === "waiting") set({ status: "streaming" });
          patchLast((m) => ({ ...m, content: m.content + e.v }));
        } else if (e.t === "error") {
          return fail(e.m);
        }
      }
    }
    if (!thread.messages.at(-1)?.content) fail(SENSEI.offline);
  } catch {
    // Stop keeps what arrived; a half-written answer is still the model's words.
    if (controller?.signal.aborted) patchLast((m) => (m.content ? m : null));
    else fail(SENSEI.network);
  } finally {
    controller = null;
    set({ status: "idle" });
  }
}

export function stopSensei(): void {
  controller?.abort();
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function useSenseiChat(provider: string | null) {
  const t = useSyncExternalStore(subscribe, snapshot, snapshot);
  const ask = useCallback((question: string, context: SenseiContext) => (provider ? askSensei(question, context, provider) : Promise.resolve()), [provider]);
  return { messages: t.messages, status: t.status, ask, stop: stopSensei };
}
