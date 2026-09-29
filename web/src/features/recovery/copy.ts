// Ported from Masayume 68f7a09:web/src/features/recovery/copy.ts
/** What recovery says about a write the journal still held open when the session came back. */
export const RECOVERY = {
  landed: (summary: string) => ({ title: "An earlier call landed", description: `${summary}. It is in your Portfolio.` }),
  absent: (summary: string) => ({ title: "An earlier send never reached the chain", description: `${summary}. Nothing was spent.` }),
  reverted: (summary: string) => ({ title: "An earlier send reverted on chain", description: `${summary}. No position was opened; nothing moved except the network fee, which our sponsor covers where it can.` }),
  expired: (summary: string) => ({
    title: "An earlier send could not be verified",
    description: `${summary} — sent over a day ago and the chain never answered. Check your Portfolio before placing it again.`,
  }),
  pending: (count: number) => ({
    title: count === 1 ? "An earlier send is still being checked" : `${count} earlier sends are still being checked`,
    description: "The chain has not answered yet. Nothing is retried on its own.",
  }),
} as const;
