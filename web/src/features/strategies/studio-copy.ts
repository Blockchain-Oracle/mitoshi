// The builder's words (S9.7c): Agari 03b30ab `copy.ts` `studio` — what each knob means in plain words, what publishing
// signs and who pays for it.
import { formatBaseUnits, USD_DECIMALS } from "@cwf/core";

const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

export const STUDIO = {
  label: "Build a strategy",
  steps: { instinct: "Its instinct", tune: "Tune it", limits: "Hard limits", publish: "Name it and publish" },
  instinct: { label: "What it trades on" },
  tune: {
    market: "Market",
    marketHelp: "One series it trades every Window of, or any Window. A copier sees this before copying.",
    anyWindow: "Any Window",
    threshold: "Trigger (bps)",
    thresholdHelp: (bps: number) => `It acts once the price has moved ${(bps / 100).toFixed(2)}% from the Window's opening print.`,
    lookback: "Lookback",
    lookbackHelp: "Prices it reads if a Window has no print yet (rare on Tempo).",
    persona: "Its brief",
    personaHelp: "How it should read a Window. It works inside fixed rules and can't change them.",
    posture: "Gate",
    postures: [
      { value: "guarded", label: "Guarded" },
      { value: "balanced", label: "Balanced" },
      { value: "active", label: "Active" },
    ] as const,
    cadences: "Window lengths it reads",
    trader: "Wallet to copy",
    traderHelp: "Their calls are public on chain, so this needs nothing from them. Copy an address from a profile.",
    within: "Freshness (seconds)",
    withinHelp: "How recent their call must be. Older and the Window has usually moved on.",
    mirrorCaveat: "A copy lands after their trade, at whatever the book holds then — never at their price, and sometimes not at all.",
  },
  limits: {
    lead: "These are written into the strategy on chain for good: every copier's grant must fit inside them.",
    perTrade: "Most per trade",
    perTradeHelp: "A copier can set less, never more.",
    daily: "Most per day",
    dailyHelp: "Per copier, resets 00:00 UTC.",
    open: "Windows at once",
    openHelp: "1 to 10.",
    price: "Never above",
    priceHelp: "Cents per side; blank for no cap.",
    fee: "Fee to copy",
    feeHelp: "Paid to you once when someone starts copying. $0 is free.",
  },
  publish: {
    name: "Name",
    description: "One line on what it does",
    identity: "Give it an ERC-8004 identity",
    identityHelp: "A public agent id it builds a reputation under. Registering is sponsored.",
    runner: "Who runs it",
    runners: [
      { value: "house", label: "The house runner" },
      { value: "own", label: "My own runner" },
    ] as const,
    houseHelp: "Mitoshi's runner trades it for every copier, around the clock.",
    ownHelp: "Your bot's key. Run it with `runner-main` (the same runner the house uses).",
    ownRunner: "Runner address",
    summary: (perTrade: bigint, daily: bigint, fee: bigint) => `${usd(perTrade)} a trade at most, ${usd(daily)} a day; ${fee === 0n ? "free to copy" : `${usd(fee)} to copy`}.`,
    signsIdentity: "1 of 2 — create its identity (sponsored)",
    signsPublish: (two: boolean) => (two ? "2 of 2 — publish it (you pay the network fee)" : "Publish it (you pay the network fee)"),
    cta: "Publish",
    identityCta: "Create its identity",
    rootNote: "Its words are stored on chain, so your passkey signs it — not a one-tap key.",
    registered: (id: string) => `Identity created: ERC-8004 agent #${id}.`,
    published: (id: string) => `Published as strategy #${id}.`,
  },
};
