/**
 * Launchpad writes (S17; plan B.5, LP rows), one intent per thing a person does on `/launch*`. Sponsorship follows the
 * relay's `launch` policy: a holder's own curve trades and claims ride the relay (`createLaunch`, `buy`, `sell`,
 * `claimFees`, `claimLeftover`, the locker's `withdraw` and `claimFees`); the stablecoin batch is capital intake over
 * five targets and the creator pays it (D-063); a swap in a graduated pool goes through the UniversalRouter and is paid
 * by the trader.
 */
import type { Address, Hex } from "../types/primitives";
import type { StablecoinLaunchInput } from "./currencyGuard";

export type LaunchIntent =
  /** The nine-call stablecoin batch (`buildStablecoinBatch`); `salt` fixes the token's address, predicted before signing. */
  | { kind: "launch-stablecoin"; input: StablecoinLaunchInput; salt: Hex }
  /** A memecoin on a published template, with an optional creator buy (capped on chain at `maxCreatorBuyBps`). */
  | { kind: "launch-meme-create"; configId: number; name: string; symbol: string; logoURI: string; metadataURI: string; salt: Hex; creatorBuyQuote: bigint; minCoinOut: bigint }
  | { kind: "launch-meme-buy"; token: Address; quoteIn: bigint; minCoinOut: bigint }
  | { kind: "launch-meme-sell"; token: Address; coinIn: bigint; minQuoteOut: bigint }
  /** pathUSD fees the launchpad owes the caller (a creator's or partner's share). */
  | { kind: "launch-claim-fees" }
  /** The leftover coin after graduation, to the template's `leftoverReceiver`. */
  | { kind: "launch-claim-leftover"; token: Address }
  /** A bucket of the graduated pool's position (unlocked, or vesting past its cliff). */
  | { kind: "launch-locker-withdraw"; coin: Address; bucket: number }
  /** The pool fees the locker accrued for the caller's buckets. */
  | { kind: "launch-locker-claim-fees"; coin: Address }
  /** A swap in the graduated pool through the pinned UniversalRouter (the pool's fee tier and spacing from the launch). */
  | { kind: "launch-pool-swap"; token: Address; fee: number; tickSpacing: number; buyCoin: boolean; amountIn: bigint; amountOutMinimum: bigint };
