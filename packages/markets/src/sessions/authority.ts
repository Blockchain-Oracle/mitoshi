// Ported from Masayume 68f7a09:packages/markets/src/sessions/authority.ts (Tempo authorities added)
/**
 * Who is signing, and under what authority.
 *
 * Authority is part of a session's identity because the product has several actors that
 * can sign concurrently. Naming the authority makes "which actor sent this?" answerable
 * from the journal and the receipt, rather than inferred from whichever signer happened to
 * be bound at the time.
 */
export type AuthorityKind =
  /** The person, signing from their own external wallet. Unrestricted over their own funds. */
  | "user-wallet"
  /** The person, signing with their passkey account (Tempo `webAuthn`, the root key). */
  | "passkey"
  /** The wallet-mode TIP-1011 access key authorised at sign-in (D-047): taps with no prompt, capped per day. */
  | "access-key"
  /** A short-lived browser session key acting for the user under a bounded grant. */
  | "session-key"
  /** The X relay executing a parsed instruction under an X_EXECUTOR grant. */
  | "x-executor"
  /** A strategy runner executing inside a STRATEGY grant. */
  | "strategy-runner"
  /** A per-player game submitter under a GAME_SESSION grant. */
  | "game-session"
  /** The market-making actor for the Earn vault. */
  | "market-maker"
  /** The leverage reserve's keeper: settles and knocks out boosts. Cannot redirect a payout. */
  | "leverage-keeper"
  /** Claim/settlement advancement. Cannot redirect a payout. */
  | "claim-actor"
  /** The duel arena's settler: cranks lock, settle, finalize and refund, all of which anyone may crank. */
  | "game-settler"
  /** Pays policy-approved fees (the relay's fee payer). Never has user-fund authority. */
  | "sponsor";

/** Authorities that act on a user's behalf rather than as the user, so they must be granted. */
const DELEGATED: ReadonlySet<AuthorityKind> = new Set<AuthorityKind>([
  "access-key",
  "session-key",
  "x-executor",
  "strategy-runner",
  "game-session",
  "market-maker",
  "leverage-keeper",
  "claim-actor",
  "sponsor",
]);

/**
 * `game-settler` is deliberately absent from that set. It acts on nobody's behalf: every call it makes
 * is permissionless, so there is no grant to hold and nothing it could do that a player could not.
 */

export function isDelegated(authority: AuthorityKind): boolean {
  return DELEGATED.has(authority);
}
