/**
 * Themes intents → calls for the one tx lane (S16a; R4-11, D-227; `relay/policies/themes.ts` decides what the relay pays):
 * - `theme-publish`: `ThemeRegistry.publish(params)` with `specHash = keccak256(JCS spec)` and the spec as a `data:` URI —
 *   self-paid (a creator's storage-heavy write is never sponsored);
 * - `theme-follow`: `[AccountKeychain.authorizeKey(agent key, scoped), ThemeRouter.follow]` in one root transaction
 *   (D-100), sponsored as the policy's `follow` shape; past five tokens the key carries every limit but only the first
 *   token scopes that fit the follow cap (`splitFollowTokens`), and `theme-key-scopes` adds the rest:
 *   `AccountKeychain.setAllowedCalls(key, ≤ 5 approve(router) scopes)`, sponsored as `scopeChunk` (R4-11);
 * - `theme-update-caps`, `theme-unfollow`, `theme-claim-fees`: one router call each, sponsored;
 * - `theme-set-agent`: the creator's `ThemeRegistry.setAgent(themeId, ERC-8004 agent id)`, self-paid.
 */
import type { TxIntent } from "@cwf/core";
import { diagnosis, specPayload, type ThemeCaps, type ThemeIntent } from "@cwf/core";
import { themeRegistryAbi } from "@cwf/clients/abis/ThemeRegistry";
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import { encodeFunctionData, getAddress, keccak256, type Address } from "viem";
import { deploymentOf } from "../deployments";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { SCOPE_CHUNK, splitFollowTokens, themeKeyAuthorizeCall, themeKeyScopes, themeKeySetAllowedCallsChunks } from "./keyAuth";
import { buildRebalanceCalls, decisionIdOf } from "./rebalance";

const isTheme = (intent: TxIntent): intent is ThemeIntent => intent.kind.startsWith("theme-");

/** The themes contracts on this chain, or null where they aren't deployed. */
export function themesVenueOf(chainId: number): { registry: Address; router: Address; deployBlock: bigint } | null {
  const d = deploymentOf("themes", chainId);
  if (!d?.ThemeRegistry || !d.ThemeRouter) return null;
  return { registry: d.ThemeRegistry.address, router: d.ThemeRouter.address, deployBlock: BigInt(d.ThemeRegistry.deployBlock ?? 0) };
}

const capsArg = (c: ThemeCaps) => {
  const expiry = BigInt(c.expirySec); // the contract's field name
  return { expiry, allocationUsd: c.allocationUsd, maxTradeUsd: c.maxTradeUsd, maxDailyUsd: c.maxDailyUsd, maxSlippageBps: c.maxSlippageBps, maxFeeBps: c.maxFeeBps, minIntervalSec: c.minIntervalSec };
};

/** `ThemeRegistry.publish`'s params from a spec (bands in the spec's token order; the cash band under pathUSD). */
export function publishParams(intent: Extract<ThemeIntent, { kind: "theme-publish" }>) {
  const { spec, tokens } = intent;
  const payload = specPayload(spec);
  if (tokens.length !== spec.bands.length) throw new Error("one band per token");
  return {
    creatorFeeBps: spec.creatorFeeBps,
    maxSlippageBps: spec.maxSlippageBps,
    minIntervalSec: spec.minIntervalSec,
    maxRefAgeSec: spec.maxRefAgeSec,
    sessionsMask: spec.sessionsMask,
    specHash: keccak256(payload.bytes),
    specURI: payload.uri,
    tokens: tokens.map((t) => getAddress(t)),
    bands: spec.bands.map((b) => ({ minBps: b.minBps, maxBps: b.maxBps, targetBps: b.targetBps, allowed: b.allowed })),
    cashBand: { minBps: spec.cashBand.minBps, maxBps: spec.cashBand.maxBps, targetBps: spec.cashBand.targetBps, allowed: true },
  };
}

export function summarizeTheme(intent: ThemeIntent): string {
  switch (intent.kind) {
    case "theme-publish":
      return `publish the theme "${intent.spec.name}" (${intent.tokens.length} stocks)`;
    case "theme-follow":
      return `follow theme #${intent.themeId}`;
    case "theme-update-caps":
      return `change your caps on theme #${intent.themeId}`;
    case "theme-unfollow":
      return `unfollow theme #${intent.themeId}`;
    case "theme-claim-fees":
      return "claim your theme creator fees";
    case "theme-key-scopes":
      return `let theme #${intent.themeId}'s agent trade ${intent.tokens.length} more stock${intent.tokens.length === 1 ? "" : "s"}`;
    case "theme-set-agent":
      return `name agent #${intent.agentId} on theme #${intent.themeId}`;
    case "theme-sell-all":
      return `sell every holding of theme #${intent.themeId} to pathUSD`;
  }
}

/** The themes area's encoder for the tx lane (`submitter/encoders.ts`): claims every `theme-*` intent. */
export function encodeThemeIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!isTheme(intent)) return null;
  const v = themesVenueOf(ctx.chainId);
  if (!v) return { ok: false, diagnosis: diagnosis("not-deployed", `themes are not deployed on chain ${ctx.chainId}`) };
  const summary = summarizeTheme(intent);
  const router = (functionName: "updateCaps" | "unfollow" | "claimFees" | "follow", args: readonly unknown[]) => ({ to: v.router, data: encodeFunctionData({ abi: themeRouterAbi, functionName, args } as never) });
  try {
    switch (intent.kind) {
      case "theme-publish":
        return { ok: true, value: { area: "themes", calls: [{ to: v.registry, data: encodeFunctionData({ abi: themeRegistryAbi, functionName: "publish", args: [publishParams(intent)] }) }], sponsored: false, summary } };
      case "theme-follow": {
        const params = { keyId: intent.keyId, router: v.router, tokens: intent.tokens, expirySec: intent.caps.expirySec, pathUsdDailyLimit: intent.pathUsdDailyLimit, tokenDailyLimits: intent.tokenDailyLimits };
        // Every daily limit in the follow tx; past five tokens only the first scopes (the rest: theme-key-scopes).
        const scopes = themeKeyScopes({ router: v.router, tokens: splitFollowTokens(intent.tokens).first });
        const auth = themeKeyAuthorizeCall(params, scopes);
        return { ok: true, value: { area: "themes", calls: [auth, router("follow", [intent.themeId, intent.version, capsArg(intent.caps), getAddress(intent.keyId)])], sponsored: true, summary } };
      }
      case "theme-key-scopes": {
        if (intent.tokens.length === 0 || intent.tokens.length > SCOPE_CHUNK) return { ok: false, diagnosis: diagnosis("contract-revert", `a scope chunk carries 1–${SCOPE_CHUNK} stocks`) };
        const [chunk] = themeKeySetAllowedCallsChunks(intent.keyId, themeKeyScopes({ router: v.router, tokens: intent.tokens }).slice(2));
        return { ok: true, value: { area: "themes", calls: [chunk!], sponsored: true, summary } };
      }
      case "theme-set-agent":
        return { ok: true, value: { area: "themes", calls: [{ to: v.registry, data: encodeFunctionData({ abi: themeRegistryAbi, functionName: "setAgent", args: [intent.themeId, intent.agentId] }) }], sponsored: false, summary } };
      case "theme-update-caps":
        return { ok: true, value: { area: "themes", calls: [router("updateCaps", [intent.themeId, capsArg(intent.caps)])], sponsored: true, summary } };
      case "theme-unfollow":
        return { ok: true, value: { area: "themes", calls: [router("unfollow", [intent.themeId])], sponsored: true, summary } };
      case "theme-claim-fees":
        return { ok: true, value: { area: "themes", calls: [router("claimFees", [])], sponsored: true, summary } };
      case "theme-sell-all": {
        // The follower's own root rebalance (no key checks, the theme's slippage): self-paid — the relay sponsors only
        // the agent's key-signed shape.
        if (intent.legs.length === 0) return { ok: false, diagnosis: diagnosis("below-min-quantity", "nothing to sell") };
        const calls = buildRebalanceCalls({ router: v.router, themeId: intent.themeId, legs: intent.legs, creatorFeeBps: intent.creatorFeeBps, decisionId: decisionIdOf(ctx.wallet, intent.themeId, Math.floor(Date.now() / 1000)) });
        return { ok: true, value: { area: "themes", calls, sponsored: false, summary } };
      }
    }
  } catch (error) {
    return { ok: false, diagnosis: diagnosis("contract-revert", error instanceof Error ? error.message : String(error)) };
  }
}
