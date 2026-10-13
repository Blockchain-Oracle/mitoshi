// Ported from Agari 03b30ab:web/src/features/sensei/copy.ts (S13 step 8) — the intro rewritten for what Sensei can do on
// Mitoshi (read the Window on screen; the person places the call), the follow-up chips kept verbatim, and the consent
// added: who receives what, said before the first question (D34).
import type { SenseiMessage } from "./protocol";

export const SENSEI_INTRO: SenseiMessage = {
  role: "assistant",
  content: "I read the Window with you: UP, DOWN or sit out. You place the call.",
};

export const SENSEI_STARTERS = ["Read this Window", "Up or down on the next close?", "Is this a coin flip?", "How are my positions doing?"] as const;

export const SENSEI = {
  title: "Sensei",
  open: "Ask Sensei",
  /** Owarine's drawer head and foot (D-226). */
  eyebrow: "Your trading assistant",
  beta: "beta",
  close: "Close Sensei",
  notAdvice: "Not financial advice. You place every call.",
  stopShort: "Stop",
  meter: { reading: "Reading…", flat: "flat", minutes: (n: number) => `${n}m`, left: "left" },
  trade: { head: "Act on it", hide: "Hide", up: "UP", down: "DOWN", pays: "pays $1" },
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
  jump: "Jump to latest",
  copy: "Copy the answer",
  copied: "Copied",
  checking: "Checking whether Sensei is on…",
  off: "Sensei is off on this server.",
  offline: "Sensei can't be reached right now. Try again in a moment.",
  network: "Network error. Try again.",
  stopped: "Stopped.",
  shared: (recipients: string) => `Questions go to ${recipients}.`,
  turnOff: "Stop sharing",
  turnedOff: "Sensei stopped. It asks again before your next question.",
  tooLong: (max: number) => `Keep it under ${max.toLocaleString("en-US")} characters.`,
  consent: {
    title: "Before you ask",
    // R4-3 (D-227), copy spec: title, lead, recipients, two short lines, a "What's sent" link — the full list is /privacy's.
    lead: "Your question goes to:",
    what: "Plus this chat and the figures on screen.",
    whatLink: "What's sent",
    whatHref: "/privacy#sensei-ai",
    not: "Never your address, keys, name or email.",
    kept: "Mitoshi doesn't store it.",
    agree: "Agree and ask",
    decline: "Not now",
    declined: "Sensei stays off. Nothing was sent.",
  },
} as const;

/**
 * The follow-up chips under a reply (Agari's `chipsFor`, verbatim rules): read from the reply's own text, and the
 * sit-it-out branch first, so a reply that just talked someone down never offers three ways to ask again.
 */
export function chipsFor(reply: string): readonly string[] {
  const text = reply.toLowerCase();
  if (/sit (this|it|the next|out)|coin.?flip|don'?t (take|call|bet)|skip it|take a breath|pause|tilt|no call/.test(text)) {
    return ["Good call, skip it", "Show me another Window", "Why sit out?"];
  }
  if (/\bup\b/.test(text) && /\bdown\b/.test(text)) return ["Why that side?", "What's the risk?", "What would flip it?"];
  if (/risk|thin|tight|lean|shakeout/.test(text)) return ["What would flip it?", "How much should I risk?", "Read the next Window"];
  return ["Why?", "What's the risk?", "Read the next Window"];
}
