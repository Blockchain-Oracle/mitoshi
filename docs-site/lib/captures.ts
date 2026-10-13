// Ported from Owarine 90a91d71:docs-site/lib/captures.ts (D-227). Two kinds of capture, both of the deployed product and
// never mock-ups:
// - `position`: a file the app already ships on /demo (web/public/demo, added in ff14bda on 2026-10-10), copied
//   unmodified; `public/captures/provenance-2026-10-10.json` holds its SHA-256 and `pnpm check:content` compares it
//   with the app's file.
// - the rest: recorded by `pnpm media:record` and published by `pnpm media:publish` into lib/media.generated.json, with
//   each file's SHA-256 in `public/captures/provenance-media.json`. A guide may name a capture the plan
//   (scripts/media-plan.json) lists before it is published; it renders nothing until then, and the check lists it.
import media from './media.generated.json';

export type Capture = { title: string; file: string; alt: string; state: string; date: string; width: number; height: number };

const shipped = {
  position: { title: "A position's details on a phone", file: 'position-phone-2026-10-10.png', alt: "A position's details at 390 × 844: the Window, where it is held, the line, the stake, what CLOSE pays now, P&L, then Reduce 25, 50 or 75 %, CLOSE, Add, TP / SL and the proof of the prints.", state: 'A test account holding one UP BTC 5m position in its wallet.', date: '10 October 2026', width: 390, height: 844 },
} as const satisfies Record<string, Capture>;

export const captures: Readonly<Record<string, Capture>> = { ...(media.captures as Record<string, Capture>), ...shipped };
