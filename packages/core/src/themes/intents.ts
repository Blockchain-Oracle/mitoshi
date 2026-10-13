/**
 * Themes writes (S16a; R4-11, D-227), one intent per thing a person does on `/themes*`. Sponsorship follows the relay's
 * `themes` policy: publishing is the creator's own storage-heavy write (self-paid); follow, caps, unfollow and the
 * creator's fee claim ride the relay.
 */
import type { Address } from "../types/primitives";
import type { ThemeSpec } from "./spec";

export interface ThemeCaps { expirySec: number; allocationUsd: bigint; maxTradeUsd: bigint; maxDailyUsd: bigint; maxSlippageBps: number; maxFeeBps: number; minIntervalSec: number }

export type ThemeIntent =
  /** A new theme: the spec (its canonical JSON travels as the `specURI` data URI) and one band per mirror token. */
  | { kind: "theme-publish"; spec: ThemeSpec; tokens: Address[] }
  /** Follow with the agent's key (authorised in the same root transaction, D-100). */
  | { kind: "theme-follow"; themeId: bigint; version: number; caps: ThemeCaps; keyId: Address; tokenDailyLimits: bigint[]; pathUsdDailyLimit: bigint; tokens: Address[] }
  | { kind: "theme-update-caps"; themeId: bigint; caps: ThemeCaps }
  /** Stops the agent; holdings stay in the wallet. */
  | { kind: "theme-unfollow"; themeId: bigint }
  | { kind: "theme-claim-fees" };
