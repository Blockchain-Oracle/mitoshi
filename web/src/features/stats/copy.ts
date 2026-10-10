/**
 * `/stats` — Masayume 68f7a09 `features/stats/copy.ts`'s words (from Yosuku's `app/stats/page.tsx`), truth-corrected
 * for Mitoshi: the proof is the engine's fill tape on Tempo testnet as our own index holds it, over all time.
 */
export const STATS = {
  hero: {
    eyebrow: "Live · on chain · verifiable",
    titleLead: "Proof of",
    titleAccent: "demand",
    lede: "Wallets that took a side on a Window, read from the engine's fills on Tempo testnet. Every call is a fill on the engine's book, so the chain proves each one: nothing here is self-reported, and every row links to its receipt.",
  },
  card: {
    title: "Wallets that made a call",
    timeFrame: "Tempo testnet · all time",
    active: (n: number) => `${n.toLocaleString("en-US")} active in the last 24 hours`,
    calls: { label: "calls", sub: "fills with a caller on one side" },
    traded: { label: "traded", sub: "pathUSD that changed hands on them" },
    paid: { label: "paid out", sub: "to wallets: winnings redeemed and Trading Balance settlements" },
    bars: "Calls per day",
    barsLabel: (from: string) => `Each bar is one UTC day, from ${from} to today.`,
    barsAria: (days: string) => `Calls per UTC day: ${days}.`,
  },
  sections: {
    growth: { index: "01", title: "Growth", tag: "cumulative wallets that made a call · by UTC day" },
    venue: { index: "02", title: "The venue", tag: "every Window the engine opened and closed" },
    activity: { index: "03", title: "Latest calls", tag: "each row opens its receipt on the explorer" },
  },
  curve: {
    empty: "The growth curve starts with the first call.",
    aria: (first: string, last: string, total: number) => `Cumulative wallets that made a call, from ${first} to ${last}: ${total} in all.`,
  },
  venue: {
    opened: { label: "Windows opened", sub: (open: number) => `${open.toLocaleString("en-US")} open right now` },
    settled: { label: "Windows settled", sub: (voided: number) => `${voided.toLocaleString("en-US")} more voided, every stake returned` },
    prints: { label: "Prints recorded", sub: "signed opening and closing prices, each re-verifiable on its proof page" },
    house: { label: "House fills", sub: "the house's taker against its own maker; left out of every figure above" },
  },
  activity: {
    empty: "No calls indexed yet.",
    kind: ["Up", "Closed Up", "Down", "Closed Down"] as readonly string[],
    product: "via a product",
    receipt: "Receipt",
  },
  attribution: (unattributed: number) =>
    `The house's keys and the maker vault are never counted. A Trading Balance tap counts for the wallet it was made for. ${
      unattributed > 0
        ? `${unattributed} ${unattributed === 1 ? "call was" : "calls were"} taken by Boost, Parlay, Range or the private desk for an owner this index doesn't record yet: counted as calls, not as wallets.`
        : ""
    }`.trim(),
  testnet:
    "Tempo testnet, test dollars only. The wallets include the fresh passkey accounts our own end-to-end checks create when they sign up: the chain can't tell them from anyone else's, so they count as what they are, wallets that made a call.",
  foot: "Read from Mitoshi's index of the engine's events, the same index an independent replay of the chain recounts (scripts/drive/recount.ts), and refreshed every few minutes.",
  computed: (at: string) => `Computed ${at} UTC.`,
  unreachable: "The index can't be read right now, so this page shows no numbers rather than old or made-up ones. Try again in a minute.",
  reading: "Reading the index…",
} as const;
