/**
 * Everything Lucky says (R4-9, D-227) — at Owarine's word count or fewer. The proof (commitment, both seeds, the
 * candidate hash) sits behind ⓘ; the machine says what was drawn, the live quote and the one action.
 */
export const LUCKY = {
  title: "Lucky",
  reels: {
    asset: "Asset",
    side: "Side",
    reach: "Reach",
    blank: "?",
    multiple: (m: number) => `×${m}`,
    announce: (asset: string, side: string, m: number) => `${asset}, ${side}, ×${m}`,
  },
  stake: "Stake",
  chip: (dollars: number) => `$${dollars}`,
  spin: "Spin",
  spinning: "Spinning…",
  signIn: "to spin Lucky",
  lever: (stake: string) => `Pull to place · ${stake}`,
  placing: "Placing…",
  placed: "Placed",
  again: "Spin again",
  deal: {
    window: (asset: string, cadence: string) => `${asset} · ${cadence} Window`,
    pays: (multiple: string) => `pays ${multiple}`,
    dealt: (multiple: string) => `dealt at ${multiple}`,
    quoting: "Reading the live quote…",
    noQuote: "No live quote on this side now",
    gone: "That Window is no longer live",
    closes: (clock: string) => `closes in ${clock}`,
  },
  refused: (why: string) => `No deal · ${why}`,
  placedLine: (stake: string) => `Your ${stake} call is in. It settles on the Window's close.`,
  failed: (why: string) => `Not placed · ${why}`,
  proof: {
    open: "Proof",
    commitment: "Commitment",
    serverSeed: "Server seed",
    clientSeed: "Your seed",
    nonce: "Nonce",
    set: "Candidates",
    candidates: (n: number, hash: string) => `${n} Windows · ${hash}`,
    verified: "Recomputed here · the draw matches",
    mismatch: "Recomputed here · the draw does NOT match",
  },
  history: {
    placed: "Placed",
    refused: "No deal",
    drawn: "Not placed",
    unknown: "Unknown",
  },
  noStore: "No draw server on this deployment.",
} as const;
