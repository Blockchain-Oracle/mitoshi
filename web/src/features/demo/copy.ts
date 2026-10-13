/**
 * `/demo` (R4-13a, D-227; Ported from Owarine 90a91d71:web/src/features/demo/copy.ts, its 8 Oct rebuild, at its word
 * count): the film, the way in, four claims a judge can check — one line and one link each — and live figures from the
 * index. The film is named as recording until it exists (an honest state, never a dead embed). Every link opens real
 * evidence: the terminal, the print verifier on the explorer, the latest settled Window's proof, the recount.
 */
export const DEMO = {
  title: "Demo",
  description: "Mitoshi in one film: a passkey, one tap, a Window that settles on RedStone's signed print, and a recount anyone can check, on Tempo.",
  /** Set when the official demo is published (a YouTube id); until then the page says it is recording. */
  video: null as null | { title: string; watchUrl: string; embedUrl: string; length: string },
  videoPending: "Recording now. The live product is below.",
  watchOn: "Watch on YouTube",
  poster: "Mitoshi's terminal on Tempo: the BTC line, the Window's clock, UP and DOWN",
  sticker: "LIVE ON TEMPO",
  heading: "Watch it work",
  lede: "Call the close in one tap. Every result is signed and checkable.",
  actions: { open: "Open the app", docs: "Docs" },
  claimsTitle: "What to check",
  claims: {
    passkey: { title: "One tap, no prompt", line: "A passkey signs you up. Then taps just go.", cta: "Try it" },
    prints: { title: "Signed prints", line: "RedStone signs every open and close.", cta: "See the verifier" },
    settles: { title: "Settles on the print", line: "Each Window pays on its signed close.", cta: "Open a proof" },
    recount: { title: "An independent recount", line: "The index, recounted from the chain.", cta: "See the recount" },
  },
  liveTitle: "Live on Tempo",
  live: { opened: "Windows opened", resolved: "Settled on a print", open: "Open now", reading: "Index unavailable" },
  receiptsTitle: "Receipts",
  receiptsOn: (date: string) => `Test accounts, read ${date}.`,
} as const;
