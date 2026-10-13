/**
 * What happened to a run's score, as the board and the game-over card say it (Owarine 90a91d71's PostState). The
 * plates that drew it over the 16:9 field gave way to the full-screen stage's (R4-9, D-227: `StageParts.tsx`).
 */
export type PostState =
  /** Play that posts nothing: no wallet, a deployment with no store, or no room to vouch for one. Says which. */
  | { kind: "local"; why: "signedOut" | "noStore" | "unavailable" | null }
  | { kind: "checking" }
  | { kind: "posted"; rank: number; isBest: boolean }
  | { kind: "refused"; why: string };
