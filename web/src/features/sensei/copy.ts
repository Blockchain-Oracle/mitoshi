// Ported from Agari 03b30ab:web/src/features/sensei/copy.ts (S13 step 8) — the intro rewritten for what Sensei can do on
// Mitoshi (read the Window on screen; the person places the call), the follow-up chips kept verbatim, and the consent
// added: who receives what, said before the first question (D34).
import type { SenseiMessage } from "./protocol";

export const SENSEI_INTRO: SenseiMessage = {
  role: "assistant",
  content: "I'm Sensei. I read the Window on your screen with you and give you a straight call: UP, DOWN, or sit it out. I read and recommend; you place the call.",
};

export const SENSEI_STARTERS = ["Read this Window", "Up or down on the next close?", "Is this a coin flip?", "How are my positions doing?"] as const;

export const SENSEI = {
  title: "Sensei",
  open: "Ask Sensei",
  placeholder: "Ask Sensei about this Window…",
  send: "Ask",
  stop: "Stop the answer",
  typing: "Sensei is thinking",
  jump: "Jump to latest",
  copy: "Copy the answer",
  copied: "Copied",
  checking: "Checking whether Sensei is on…",
  off: "Sensei isn't switched on here yet: no model is configured on this server. Everything else on Mitoshi works without it.",
  offline: "Sensei can't be reached right now. Try again in a moment.",
  network: "Network error. Try again.",
  stopped: "Stopped.",
  shared: (recipients: string) => `Questions go to ${recipients}.`,
  turnOff: "Stop sharing",
  turnedOff: "Sensei stopped. It asks again before your next question.",
  tooLong: (max: number) => `Keep it under ${max.toLocaleString("en-US")} characters.`,
  consent: {
    title: "Before you ask",
    lead: "Sensei is an AI model. To answer, Mitoshi's server sends your question to:",
    what: "With it go the conversation so far (up to 12 turns) and the figures on your screen: prices, the Window's line and each side's price, your open positions as amounts, your settled record, and upcoming earnings dates.",
    not: "Never sent: your address, your keys, your name or your email.",
    kept: "Mitoshi doesn't store the conversation; it stays in this tab. The provider handles it under its API terms.",
    later: "Stop sharing any time from Sensei's footer.",
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
