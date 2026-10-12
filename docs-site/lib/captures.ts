// Ported from Owarine 90a91d71:docs-site/lib/captures.ts (D-227). A capture is a file the app already ships on /demo
// (web/public/demo, added in ff14bda on 2026-10-10 from the deployed product), copied unmodified;
// `public/captures/provenance-2026-10-10.json` holds its SHA-256 and `pnpm check:content` compares it with the app's
// file. Only captures with no app chrome are used: the shell has changed since (rounds 2–4, D-224…D-227).
export type Capture = { title: string; file: string; alt: string; state: string; date: string; width: number; height: number };

export const captures = {
  position: { title: "A position's details on a phone", file: 'position-phone-2026-10-10.png', alt: "A position's details at 390 × 844: the Window, where it is held, the line, the stake, what CLOSE pays now, P&L, then Reduce 25, 50 or 75 %, CLOSE, Add, TP / SL and the proof of the prints.", state: 'A test account holding one UP BTC 5m position in its wallet.', date: '10 October 2026', width: 390, height: 844 },
} as const satisfies Record<string, Capture>;

export type CaptureName = keyof typeof captures;
