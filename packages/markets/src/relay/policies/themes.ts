/**
 * Relay policy for the `themes` area (plan C.3.3, B.4.3–B.4.4, S16c.4). Shape = `RelayPolicy` (S1 `relay/types.ts`,
 * listed in `policies/index.ts`), plus `batches`: the whole-tx shapes the relay sponsors, because two of them also call
 * the AccountKeychain precompile, which is no area's contract and must never be sponsored on its own.
 *
 * - **follow** (D-100): one root-signed tx `[AccountKeychain.authorizeKey, ThemeRouter.follow]` — ≈ 17.5M for a
 *   5-token key + 0.93M for `follow` (X4; fork of the deployed router); `maxGas` 22M. `authorizeKey` is sponsored only inside this shape.
 * - **scopeChunk** (D-100 split, themes > 5 tokens): `[AccountKeychain.setAllowedCalls]` ≈ 10.2M per 5 targets; the
 *   relay sponsors it only when the sender's `followOf(sender, themeId).keyId` equals the chunk's key (it reads the
 *   router before signing).
 * - **rebalance** (B.4.4): the agent's key-signed `[approve(router) × k, ThemeRouter.rebalance]`, ≤ 8 calls (the
 *   relay cap: pathUSD + up to 6 sold tokens + rebalance); approvals are only to the router (the key's scope already
 *   binds that). Sponsored so the agent's fees neither drain the follower nor eat the key's pathUSD limit (X4 E).
 *   ≈ 0.3M per leg + 0.25M per first-time holding → `maxGas` 6M.
 * - **exit**: `updateCaps`, `unfollow`, `[AccountKeychain.revokeKey, ThemeRouter.unfollow]` — exits always open;
 *   `claimFees` pays the creator (`msg.sender`) only.
 * - Not sponsored (the sender pays): `publish`, `publishVersion`, `setAgent` (creators' storage-heavy writes).
 * - `never`: owner (Safe) configuration of either contract.
 * - Geofence: `follow` is the themes entry (stocks posture, Q-008); exits stay open everywhere.
 */
import type { Abi, Address, Hex } from "viem";
import { getAddress, toFunctionSelector } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { relayTargets } from "@cwf/clients";
import { themeRegistryAbi } from "@cwf/clients/abis/ThemeRegistry";
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import type { RelayPolicy } from "../types";

const byChain = relayTargets as Record<string, Record<string, readonly string[]>>;
/** ThemeRegistry + ThemeRouter on every chain they are deployed on (generated from deployment fragments). */
const targets: readonly Address[] = Object.values(byChain).flatMap((areas) => (areas.themes ?? []) as Address[]);

const KEYCHAIN = getAddress(Addresses.accountKeychain);
const APPROVE: Hex = "0x095ea7b3";
const sel = (abi: Abi, name: string, inputs?: number): Hex => {
  const fn = abi.find((e) => e.type === "function" && e.name === name && (inputs === undefined || e.inputs.length === inputs));
  if (!fn) throw new Error(`themes policy: ${name} not in ABI`);
  return toFunctionSelector(fn as never);
};

/** One call in a sponsored shape: a target kind and the selectors it may carry. */
export interface ShapeCall { target: "router" | "keychain" | "tip20"; selectors: readonly Hex[]; min: number; max: number }
export interface Shape { name: string; signer: "root" | "accessKey"; calls: readonly ShapeCall[]; maxCalls: number; maxGas: bigint }

const router = (name: string, n = 1): ShapeCall => ({ target: "router", selectors: [sel(themeRouterAbi as Abi, name)], min: n, max: n });
const keychain = (name: string, inputs?: number): ShapeCall => ({ target: "keychain", selectors: [sel(Abis.accountKeychain as Abi, name, inputs)], min: 1, max: 1 });

export const themesPolicy = {
  area: "themes" as const,
  targets,
  keychain: KEYCHAIN,
  abi: [...themeRouterAbi, ...themeRegistryAbi] as Abi,
  sponsor: ["follow", "rebalance", "updateCaps", "unfollow", "claimFees"] as readonly string[],
  never: [
    "setGuard", "setTokenPool", "delist", "setOracle", "setProofTarget", "setProofSelector",
    "transferOwnership", "acceptOwnership", "renounceOwnership",
  ] as readonly string[],
  batches: [
    { name: "follow", signer: "root", calls: [keychain("authorizeKey", 3), router("follow")], maxCalls: 2, maxGas: 22_000_000n },
    { name: "scopeChunk", signer: "root", calls: [keychain("setAllowedCalls")], maxCalls: 1, maxGas: 12_000_000n },
    { name: "rebalance", signer: "accessKey", calls: [{ target: "tip20", selectors: [APPROVE], min: 0, max: 7 }, router("rebalance")], maxCalls: 8, maxGas: 6_000_000n },
    { name: "updateCaps", signer: "root", calls: [router("updateCaps")], maxCalls: 1, maxGas: 500_000n },
    { name: "unfollow", signer: "root", calls: [router("unfollow")], maxCalls: 1, maxGas: 300_000n },
    { name: "revokeAndUnfollow", signer: "root", calls: [keychain("revokeKey"), router("unfollow")], maxCalls: 2, maxGas: 500_000n },
    { name: "claimFees", signer: "root", calls: [router("claimFees")], maxCalls: 1, maxGas: 500_000n },
  ] as readonly Shape[],
  // Themes follow the stocks geofence posture (Q-008): `follow` is the entry, exits stay open.
  pillar: "stocks" as const,
  entry: ["follow"] as readonly string[],
  maxGas: 22_000_000n,
} satisfies RelayPolicy & { keychain: Address; batches: readonly Shape[] };

const isTip20 = (a: string) => a.toLowerCase().startsWith("0x20c0");

/**
 * The sponsored shape a batch matches, or `null` (the relay refuses to sponsor it). Calls must appear in the shape's
 * order; a TIP-20 call may only be `approve(router, …)`; the router must be a deployed ThemeRouter.
 */
export function matchThemesBatch(calls: readonly { to: Address; data: Hex }[], signer: "root" | "accessKey"): string | null {
  const routers = new Set(themesPolicy.targets.map((t) => t.toLowerCase()));
  for (const shape of themesPolicy.batches) {
    if (shape.signer !== signer || calls.length === 0 || calls.length > shape.maxCalls) continue;
    let i = 0;
    let routerSeen: string | undefined;
    let ok = true;
    for (const part of shape.calls) {
      let n = 0;
      while (i < calls.length && n < part.max && fits(part, calls[i]!, routers)) {
        if (part.target === "router") routerSeen = calls[i]!.to.toLowerCase();
        i++;
        n++;
      }
      if (n < part.min) {
        ok = false;
        break;
      }
    }
    if (!ok || i !== calls.length) continue;
    // every approve must name the batch's router as spender
    const spenderOk = calls.every((c) => !isTip20(c.to) || (routerSeen !== undefined && `0x${c.data.slice(34, 74)}`.toLowerCase() === routerSeen));
    if (spenderOk) return shape.name;
  }
  return null;
}

function fits(part: ShapeCall, call: { to: Address; data: Hex }, routers: Set<string>): boolean {
  const selector = call.data.slice(0, 10).toLowerCase() as Hex;
  if (!part.selectors.includes(selector)) return false;
  if (part.target === "router") return routers.has(call.to.toLowerCase());
  if (part.target === "keychain") return call.to.toLowerCase() === KEYCHAIN.toLowerCase();
  return isTip20(call.to);
}
