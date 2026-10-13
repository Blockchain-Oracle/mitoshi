// Ported from Owarine 90a91d71:web/src/features/strategies/identity.ts (R4-6, D-227) — a strategy's public face travels
// with its registry metadata (its name, its portrait seed), so a runner change can't rename or re-face an agent; plus the
// card's one mono "instinct" line from the spec Mitoshi published (preset · market).
import type { StrategyWire } from "./protocol";
import { codenameFromAddress, shortAddress } from "./names";

export function strategyIdentity(card: Pick<StrategyWire, "strategyId" | "name" | "portraitSeed">): { name: string; seed: string } {
  const seed = card.portraitSeed ?? `mitoshi-strategy:${card.strategyId}`;
  return { name: card.name.trim().slice(0, 64) || codenameFromAddress(seed), seed };
}

/** "momentum · BTC 5m", "AI · guarded · any Window", "mirror · 0x12ab…cdef": what it trades on, in one line. */
export function instinctOf(card: Pick<StrategyWire, "spec" | "envelope">): string {
  const market = card.envelope.seriesLabel ?? "any Window";
  const s = card.spec;
  if (!s) return market;
  if (s.preset === "agent") return `AI · ${s.posture} · ${market}`;
  if (s.preset === "mirror") return `mirror · ${shortAddress(s.trader)} · ${market}`;
  if (s.preset === "basket") return `theme · ${s.members.map((m) => m.symbol).join(", ")}`;
  return `${s.preset} · ${market}`;
}

/** The one line a header shows: the creator's description, else the spec's first sentence, else the instinct. */
export function oneLineOf(card: Pick<StrategyWire, "description" | "specText" | "spec" | "envelope">): string {
  const first = card.specText?.split(/(?<=\.)\s/)[0] ?? null;
  return card.description.trim() || first || instinctOf(card);
}
