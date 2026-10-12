// The one frame every mode shares (Owarine 90a91d71 app/games/layout.tsx; P4, D-223): the way back, the economic label,
// sound, haptics and motion — mounted once, so a mode added later inherits them.
import type { ReactNode } from "react";
import { GamesShell } from "@/features/games/GamesShell";

export default function GamesLayout({ children }: { children: ReactNode }) {
  return <GamesShell>{children}</GamesShell>;
}
