// `/surface` (S10e; Ported in role from Masayume 68f7a09:web/src/features/surface/copy.ts): the reference's page read a
// volatility model back; Masayume swapped it for the venue's book. Here both are real on Tempo: every Window is priced
// by the engine's own order book, and the crypto 5-minute Windows also carry the fair-value guard's model (PD-2: the
// signed RedStone spot, the Series' σ and the time left). The words say which figure is which; nothing is estimated.
export const SURFACE = {
  eyebrow: "Market Surface",
  title: "The market's shape",
  intro: "Every Window is priced by a live order book on Tempo — resting bids and asks, not a formula. On the crypto 5-minute lanes the reserves also check a market model: the chance the close lands above the opening print, from the signed spot price, the Series' volatility and the time left. Here you can read both back, Window by Window, with the price path since each one opened.",
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
    open: "Open this Window's ticket",
    model: (pct: string) => `The model gives UP ${pct} at the latest signed spot.`,
    noModel: "No fair-value model on this Series yet — the reserves (Parlay, Range, Boost) price only the modelled Windows.",
  },
  foot: "Books are read from the engine; the model from the fair-value guard contract (`previewFairUpE6`) at the latest signed RedStone spot; the path from the price relay's signed prints. A Window settles on the RedStone signed print at its close.",
} as const;
