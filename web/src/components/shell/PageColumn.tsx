// A reading page's column (critic gap 25, R4-8 D-227; Owarine 90a91d71 keeps `.container`'s max-width inside the
// stage): no inset of its own — the stage is the one inset — and from 1600 px its measure stops at 90 rem, centred
// (app-shell.css `.page-col`). Route layouts wrap the reading pages in it; the hero, the terminal and the reels don't.
import type { ReactNode } from "react";

export function PageColumn({ children }: { children: ReactNode }) {
  return <div className="page-col">{children}</div>;
}
