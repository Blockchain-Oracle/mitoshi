// Ported from Agari 03b30ab:web/src/features/sensei/copy.ts (S13 step 8) — the intro rewritten for what Sensei can do on
// Mitoshi (read the Window on screen; the person places the call), the follow-up chips kept verbatim, and the consent
// added: who receives what, said before the first question (D34).
import type { Lean } from "./lean";
import type { SenseiMessage } from "./protocol";

export const SENSEI_INTRO: SenseiMessage = {
  role: "assistant",
  content: "I read the Window with you. You place the call.",
};

/** Asked from the first screen beside the read itself (round 7: the read is the one big button). */
export const SENSEI_STARTERS = ["Is this a coin flip?", "How are my positions doing?"] as const;

export const SENSEI = {
  title: "Sensei",
  beta: "Beta",
  close: "Close Sensei",
  notAdvice: "Not financial advice. You place every call.",
  meter: { reading: "Reading…", over: "over the line", under: "under the line", on: "On the line", left: "left" },
  /** Round 7: the first screen is one read, the sharing said beside it (no consent wall), then the answer as a card. */
  read: (window: string) => `Read ${window}`,
  readAny: "Read this Window",
  readAgain: (window: string) => `Read ${window} again`,
  sharing: (recipients: string) => `Sends this Window's figures and your question to ${recipients}. Never your address or keys.`,
  lean: { up: "Leans UP", down: "Leans DOWN", sit: "Sit this one out" },
  act: { up: "UP", down: "DOWN", pick: "Pick it on the chart" },
  /** The floating dock (Owarine 90a91d71 `SenseiDock`; O-6): three pops of a teaser, then it rests. */
  teasers: ["Up or down?", "Coin-flip?", "Want a read?", "Which way?"],
  dockOpen: "Open Sensei, your trading assistant",
  dockAsk: (teaser: string) => `Ask Sensei: ${teaser}`,
  dockName: "Sensei",
  dockNameEmphasis: "AI",
  placeholder: "Ask Sensei about this Window…",
  send: "Ask",
  stop: "Stop the answer",
  typing: "Sensei is thinking",
  checking: "Checking whether Sensei is on…",
  off: "Sensei is off on this server.",
  offline: "Sensei can't be reached right now. Try again in a moment.",
  network: "Network error. Try again.",
  /** The sharing is said beside the read (round 7); /privacy keeps the full list. */
  consent: { whatLink: "What's sent", whatHref: "/privacy#sensei-ai" },
} as const;

/**
 * The follow-up chips under a reply (Agari's `chipsFor`, verbatim rules): read from the reply's own text, and the
 * sit-it-out branch first, so a reply that just talked someone down never offers three ways to ask again.
 */
export function chipsFor(reply: string, lean: Lean | null = null): readonly string[] {
  const text = reply.toLowerCase();
  if (lean === "sit") return ["Good call, skip it", "Show me another Window", "Why sit out?"];
  if (lean) return ["Why that side?", "What's the risk?", "What would flip it?"];
  if (/sit (this|it|the next|out)|coin.?flip|don'?t (take|call|bet)|skip it|take a breath|pause|tilt|no call/.test(text)) {
    return ["Good call, skip it", "Show me another Window", "Why sit out?"];
  }
  if (/\bup\b/.test(text) && /\bdown\b/.test(text)) return ["Why that side?", "What's the risk?", "What would flip it?"];
  if (/risk|thin|tight|lean|shakeout/.test(text)) return ["What would flip it?", "How much should I risk?", "Read the next Window"];
  return ["Why?", "What's the risk?", "Read the next Window"];
}
