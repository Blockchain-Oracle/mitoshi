/** The reactions a room message or a take can get (S13): a fixed set, so counts stay comparable and nothing is typed in. */
export const REACTIONS = [
  { kind: "fire", emoji: "🔥", label: "fire" },
  { kind: "up", emoji: "📈", label: "up" },
  { kind: "down", emoji: "📉", label: "down" },
  { kind: "laugh", emoji: "😂", label: "laugh" },
  { kind: "eyes", emoji: "👀", label: "watching" },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]["kind"];
export const isReactionKind = (v: unknown): v is ReactionKind => REACTIONS.some((r) => r.kind === v);
