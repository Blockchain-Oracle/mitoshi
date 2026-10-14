/**
 * `/demo` (R4-13a, D-227; Ported from Owarine 90a91d71:web/src/features/demo/copy.ts, its 8 Oct rebuild, at its word
 * count): the walkthrough, the way in, four claims a judge can check — one line and one link each — and live figures from the
 * index. The dated paper-trading recording is separate from the testnet receipts. Every link opens real
 * evidence: the terminal, the print verifier on the explorer, the latest settled Window's proof, the recount.
 */
type DemoVideoSource =
  | { kind: "youtube"; title: string; watchUrl: string; embedUrl: string }
  | { kind: "local"; title: string; src: string; poster: string; captions: string; description: string };

export const DEMO = {
  title: "Demo",
  description: "Watch a recorded Mitoshi paper call, then inspect signed prints, settlement proofs and Tempo receipts.",
  /** Replace this source with the official YouTube URL and embed when the owner publishes it. */
  video: {
    kind: "local",
    title: "A first call in Mitoshi · 20 seconds",
    src: "/demo/first-call.mp4",
    poster: "/demo/first-call.jpg",
    captions: "/demo/first-call.vtt",
    description: "Recorded 13 October 2026 in a signed-out browser. This is a paper call on live prices; it does not send an onchain transaction.",
  } as DemoVideoSource,
  watchOn: "Watch on YouTube",
  sticker: "LIVE ON TEMPO",
  heading: "Watch it work",
  lede: "See a paper call from tap to close. Then check the testnet proof and receipts below.",
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
