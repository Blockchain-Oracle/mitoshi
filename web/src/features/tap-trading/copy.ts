/**
 * Tap-trading with the wallet-mode key (D-047) — Masayume's arm grammar (68f7a09:web/src/features/session/copy.ts
 * `modal`: one lead sentence, the facts, the skip line), with this key's facts: it counts new approvals against a
 * daily limit ("up to $25 of new approvals a day", D-138), lives 24 hours, and can only trade on the engine.
 */
export const TAP = {
  eyebrow: "Tap-trading · trading key",
  title: "Arm tap-trading",
  lead: "Arm tap-trading once, and your calls sign with no prompt.",
  facts: (limit: string, hours: number) => `A key on this device may approve up to ${limit} of new spending a day, for ${hours} hours — for calls, cash-outs and collecting only. It can never withdraw or send your money anywhere else.`,
  sponsored: "No fees to pay: we cover the network fee, the first call included.",
  skip: "Skip it, and every call simply asks your passkey instead.",
  cta: "Arm tap-trading",
  busy: "Confirm with your passkey…",
  armed: "Tap-trading is on.",
  armedBody: (limit: string, until: string) => `Calls on this device sign with no prompt, up to ${limit} of new approvals a day, until ${until}. See or stop it any time in Account.`,
  manage: "Manage keys",
  failed: "Tap-trading didn't turn on. Nothing was taken — every call will ask your passkey.",
  aborted: "No key was made. Every call will ask your passkey.",
  retry: "Try again",
  chip: {
    on: "tap-trading on",
    off: "tap-trading",
    titleOn: (limit: string, until: string) => `Calls sign with no prompt, up to ${limit} of new approvals a day, until ${until}.`,
    titleOff: "Arm popup-free calls: one passkey prompt now, none per call.",
    titleUnavailable: "Tap-trading needs a passkey account; this wallet signs each call itself.",
  },
  pendingOnChain: "Armed on this device — goes live on chain with your first call.",
} as const;
