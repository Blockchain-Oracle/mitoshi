/**
 * `/stats` — Owarine 90a91d71 `features/stats/copy.ts` at its counts (R4-10, D-227), truth-corrected for Mitoshi: the
 * proof is the engine's fill tape on Tempo testnet as our own index holds it, over all time. How a call is attributed
 * and recounted is told on /docs/record.
 */
export const STATS = {
  hero: {
    eyebrow: "Live · on chain",
    titleLead: "Proof of",
    titleAccent: "demand",
    lede: "Wallets that took a side, read from the engine's fills.",
    headline: "Wallets that made a call",
    caption: (n: number) => `${n.toLocaleString("en-US")} active in 24 h`,
    foot: "Calls",
  },
  bars: (from: string) => `${from} → today`,
  barsAria: (days: string) => `Calls per UTC day: ${days}.`,
  sections: {
    growth: { index: "01", title: "Growth", desc: "by UTC day" },
    adoption: { index: "02", title: "Adoption" },
    activity: { index: "03", title: "Live activity", desc: "latest" },
    venue: { index: "04", title: "Venue" },
  },
  curve: {
    empty: "The growth curve starts with the first call.",
    aria: (first: string, last: string, total: number) => `Cumulative wallets that made a call, from ${first} to ${last}: ${total} in all.`,
  },
  card: {
    wallets: { label: "Wallets" },
    calls: { label: "Calls" },
    traded: { label: "Traded", sub: "pathUSD" },
    paid: { label: "Paid out", sub: "to wallets" },
  },
  venue: {
    opened: { label: "Opened", sub: (open: number) => `${open.toLocaleString("en-US")} open now` },
    settled: { label: "Settled", sub: (voided: number) => `${voided.toLocaleString("en-US")} voided` },
    prints: { label: "Prints", sub: "signed by RedStone →" },
    house: { label: "House fills", sub: "not counted" },
  },
  activity: {
    empty: "No calls indexed yet.",
    kind: ["Up", "Closed Up", "Down", "Closed Down"] as readonly string[],
    product: "via a product",
  },
  foot: (unattributed: number, at: string) =>
    `Testnet dollars. House keys never counted${unattributed ? ` · ${unattributed.toLocaleString("en-US")} calls unattributed` : ""}. Computed ${at} UTC.`,
  how: "How it's counted →",
  unreachable: "Index unreachable. No numbers until it answers.",
  reading: "Reading the index…",
} as const;
