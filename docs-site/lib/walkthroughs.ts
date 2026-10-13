// Ported from Owarine 90a91d71:docs-site/lib/walkthroughs.ts (D-227). `pnpm media:publish` adds an entry only after the
// clip, its captions, its poster and its provenance are written and the encoded file has passed ffprobe.
import media from './media.generated.json';

export type WalkthroughChapter = { time: number; title: string; text: string };
export type WalkthroughMovie = {
  title: string;
  description: string;
  poster: string;
  duration: number;
  capturedAt: string;
  origin: string;
  chapters: WalkthroughChapter[];
  sources: { src: string; type: string }[];
  captions: string;
  metadata: string;
};

export const walkthroughs = media.walkthroughs as Record<string, WalkthroughMovie>;

export function walkthroughTimestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
