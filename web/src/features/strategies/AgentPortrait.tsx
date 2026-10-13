// Ported from Owarine 90a91d71:web/src/features/strategies/AgentPortrait.tsx (R4-6, D-227) — a strategy's face, the same
// everywhere it appears: a DiceBear Notionists persona (MIT code, CC0 art; THIRD_PARTY_NOTICES) drawn inline from its
// seed, never fetched, on the cream paper tile (strategies.css). It breathes on its own beat and nods on hover; still
// under reduced motion.
import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { accentIndex } from "./names";
import "./strategies.css";

const DRAWN_CAP = 512;
const drawn = new Map<string, string>();

function persona(seed: string): string {
  const cached = drawn.get(seed);
  if (cached !== undefined) return cached;
  const svg = createAvatar(notionists, { seed, radius: 12 }).toString();
  if (drawn.size >= DRAWN_CAP) drawn.clear();
  drawn.set(seed, svg);
  return svg;
}

const idlePhase = (seed: string) => ({ "--idle-phase": `${((accentIndex(seed) * 0.45) % 3.6).toFixed(2)}s` }) as CSSProperties;

export function AgentPortrait({ seed, name, size = "card" }: { seed: string; name: string; size?: "small" | "row" | "card" }) {
  return (
    <div role="img" aria-label={`${name}, agent portrait`} style={idlePhase(seed)} className={cn("strat-sigil shrink-0", `strat-sigil--${size}`)}>
      <span aria-hidden className="strat-sigil-paper" dangerouslySetInnerHTML={{ __html: persona(seed) }} />
    </div>
  );
}
