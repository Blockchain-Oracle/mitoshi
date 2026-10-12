// `/surface` (S10e; Ported in role from Masayume 68f7a09:web/src/features/surface/copy.ts): the reference's page read a
// volatility model back; Masayume swapped it for the venue's book. Here both are real on Tempo: every Window is priced
// by the engine's own order book, and the crypto 5-minute Windows also carry the fair-value guard's model (PD-2: the
// signed RedStone spot, the Series' σ and the time left). The words say which figure is which; nothing is estimated.
export const SURFACE = {
  eyebrow: "Market Surface",
  title: "The market's shape",
  intro: "Every Window's live order book, at a glance.",
  assets: "Asset",
  loading: "Reading the live Windows…",
  noLive: "No live Windows right now — the surface fills in when the next Window opens.",
  table: "Live Windows",
  columns: { window: "Window", closes: "Closes in", path: "Price since open", open: "Opening print", up: "UP ask", bid: "UP bid", model: "Model UP", gap: "Book − model", spread: "Spread", depth: "Bids / asks" },
  none: "—",
  hydrating: "…",
  noModel: "no model",
  pendingPrint: "waiting for the print",
  expand: (w: string) => `Show the ${w} book`,
  collapse: (w: string) => `Hide the ${w} book`,
  pathLabel: (asset: string) => `${asset} since the Window opened`,
  detail: {
    depth: "Depth — UP bids below the mid, UP asks above, cumulative contracts",
    open: "Trade this Window",
    model: (pct: string) => `The model gives UP ${pct} at the latest signed spot.`,
    noModel: "No fair-value model on this Series yet — the reserves (Parlay, Range, Boost) price only the modelled Windows.",
  },
  foot: "Book: engine · Model: fair-value guard · Settles: RedStone.",
} as const;
