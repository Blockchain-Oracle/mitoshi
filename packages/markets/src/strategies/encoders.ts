// Ported from Masayume 68f7a09:packages/markets/src/strategies/write.ts (`sendStrategyIntent`) — rebuilt as intent →
// calls for the one tx lane, against the registry as deployed (D-218, D-219).
/**
 * StrategyRegistry intents (plan C.2.3; L-51, L-53):
 * - `strategy-publish` / `strategy-update`: one call; metadata is SSTORE2 bytes, so the root key signs (D-019) and the
 *   creator pays (the relay's `never` list);
 * - `strategy-copy`: ONE self-paid transaction — the STRATEGY grant to the runner (`depositAndGrant` with its exact
 *   approval when the Trading Balance is short), the exact fee approval, then `subscribe(id, 0, mode, maxFee)`, which
 *   reads the grant the same batch just made (D-219.2);
 * - `strategy-subscribe`: move onto another grant or switch follow ↔ fade while subscribed (no fee, D-219.3);
 * - `strategy-pause`: revoke the grant, keep the consent — the vault's sponsored exit;
 * - `strategy-stop`: revoke + `unsubscribe` in one sponsored transaction (the relay's companion rule, D-218.2);
 * - `strategy-unsubscribe` / `strategy-deactivate`: one sponsored call.
 */
import { encodeFunctionData, keccak256, toBytes, toHex, zeroHash, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import {
  diagnosis,
  encodeSpec,
  encodeStrategyMetadata,
  formatBaseUnits,
  GRANT_KIND_INDEX,
  isSpec,
  SUBSCRIPTION_MODES,
  USD_DECIMALS,
  type StrategyEnvelope,
  type StrategyIntent,
  type StrategyMetadata,
  type StrategySpec,
  type TxIntent,
} from "@cwf/core";
import { approveCall, MAX_SPONSORED_CALLS as MAX_CALLS, type Call } from "../tx/batch";
import type { EncodeContext, EncodeResult } from "../submitter/encoders";
import { capsTuple, vaultDeploymentOf } from "../vault/read";
import { strategyVenueOf } from "./deployment";

const registryCall = (to: Address, functionName: string, args: readonly unknown[]): Call => ({
  to,
  data: encodeFunctionData({ abi: strategyRegistryAbi, functionName: functionName as never, args: args as never }),
});
const vaultCall = (to: Address, functionName: string, args: readonly unknown[]): Call => ({
  to,
  data: encodeFunctionData({ abi: eventVaultAbi, functionName: functionName as never, args: args as never }),
});

/** What `specHash` is taken over: the spec's compact, deterministic encoding (Masayume `encodeSpec`). */
export function specHashOf(spec: StrategySpec): Hex {
  return keccak256(toBytes(encodeSpec(spec)));
}

/** The metadata as published: UTF-8 JSON bytes, the spec inside it always the intent's own. */
export function metadataBytesOf(metadata: StrategyMetadata, spec: StrategySpec): Hex {
  return toHex(toBytes(encodeStrategyMetadata({ ...metadata, spec })));
}

export function envelopeTuple(e: StrategyEnvelope) {
  return { maxStakePerTrade: e.maxStakePerTradeBase, maxDailySpend: e.maxDailySpendBase, maxOpenPositions: e.maxOpenPositions, maxPriceRaw: e.maxPriceRaw, market: (e.series ?? zeroHash) as Hex };
}

const usd = (base: bigint) => `$${formatBaseUnits(base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;

export function summarizeStrategy(intent: StrategyIntent): string {
  switch (intent.kind) {
    case "strategy-publish":
      return `publish "${intent.metadata.name}"${intent.feeBase > 0n ? ` with a ${usd(intent.feeBase)} fee` : ""}`;
    case "strategy-update":
      return `update strategy #${intent.strategyId}`;
    case "strategy-copy":
      return `${intent.mode === "fade" ? "fade" : "copy"} strategy #${intent.strategyId} with a ${usd(intent.budgetBase)} budget${intent.maxFeeBase > 0n ? `, fee up to ${usd(intent.maxFeeBase)}` : ""}${intent.carry?.length ? `, keeping ${intent.carry.length} other cop${intent.carry.length === 1 ? "y" : "ies"} on it` : ""}`;
    case "strategy-subscribe":
      return `${intent.mode === "fade" ? "fade" : "follow"} strategy #${intent.strategyId} on grant #${intent.grantId}`;
    case "strategy-pause":
      return `pause copying strategy #${intent.strategyId}`;
    case "strategy-stop":
      return `stop copying strategy #${intent.strategyId}`;
    case "strategy-unsubscribe":
      return `end the subscription to strategy #${intent.strategyId}`;
    case "strategy-deactivate":
      return `close strategy #${intent.strategyId} to new copiers`;
  }
}

const refuse = (technical: string, errorName?: string): EncodeResult => ({ ok: false, diagnosis: diagnosis("contract-revert", technical, errorName ? { errorName } : undefined) });

/** The registry's encoder for the tx lane (`submitter/encoders.ts`): claims every `strategy-*` intent. */
export function encodeStrategyIntent(intent: TxIntent, ctx: EncodeContext): EncodeResult | null {
  if (!intent.kind.startsWith("strategy-")) return null;
  const i = intent as StrategyIntent;
  const venue = strategyVenueOf(ctx.chainId);
  if (!venue) return { ok: false, diagnosis: diagnosis("not-deployed", `StrategyRegistry is not deployed on chain ${ctx.chainId}`) };
  const vault = vaultDeploymentOf(ctx.chainId);
  // The registry reads one vault for life; a grant on any other would never satisfy it.
  if (!vault || vault.eventVault !== venue.vault) return { ok: false, diagnosis: diagnosis("not-deployed", `the registry reads ${venue.vault}, not the current Trading Balance`) };
  const r = venue.strategyRegistry;
  const v = vault.eventVault;
  const done = (area: "strategies" | "vault2", calls: Call[], sponsored: boolean): EncodeResult => ({ ok: true, value: { area, calls, sponsored, summary: summarizeStrategy(i) } });

  switch (i.kind) {
    case "strategy-publish":
    case "strategy-update": {
      if (!isSpec(i.spec)) return refuse("the spec is not one the runner can evaluate");
      const metadata = metadataBytesOf(i.metadata, i.spec);
      const bytes = (metadata.length - 2) / 2;
      if (bytes > venue.maxMetadataBytes) return refuse(`metadata is ${bytes} bytes; the registry keeps at most ${venue.maxMetadataBytes}`, "MetadataTooLarge");
      if (i.kind === "strategy-update") return done("strategies", [registryCall(r, "update", [i.strategyId, specHashOf(i.spec), metadata, i.feeBase])], false);
      if (i.envelope.maxStakePerTradeBase <= 0n || i.envelope.maxDailySpendBase <= 0n || i.envelope.maxOpenPositions <= 0) return refuse("the envelope needs a stake cap, a daily cap and at least one position", "BadEnvelope");
      return done("strategies", [registryCall(r, "publish", [i.runner, specHashOf(i.spec), metadata, envelopeTuple(i.envelope), i.feeBase, i.agentId ?? 0n])], false);
    }
    case "strategy-copy": {
      if (i.budgetBase <= 0n) return { ok: false, diagnosis: diagnosis("below-min-quantity", "the budget must be above zero", { errorName: "ZeroAmount" }) };
      if (i.depositBase < 0n || i.maxFeeBase < 0n) return refuse("negative amount");
      const grant = [GRANT_KIND_INDEX.strategy, i.runner, capsTuple(i.caps), BigInt(i.expiresAtSec), i.budgetBase] as const;
      const calls: Call[] =
        i.depositBase > 0n ? [approveCall(vault.collateral, v, i.depositBase), vaultCall(v, "depositAndGrant", [i.depositBase, ...grant])] : [vaultCall(v, "grant", grant)];
      if (i.maxFeeBase > 0n) calls.push(approveCall(vault.collateral, r, i.maxFeeBase));
      calls.push(registryCall(r, "subscribe", [i.strategyId, 0n, SUBSCRIPTION_MODES.indexOf(i.mode), i.maxFeeBase]));
      for (const c of i.carry ?? []) if (c.strategyId !== i.strategyId) calls.push(registryCall(r, "subscribe", [c.strategyId, 0n, SUBSCRIPTION_MODES.indexOf(c.mode), 0n]));
      if (calls.length > MAX_CALLS) return refuse(`${calls.length} calls in one transaction; at most ${MAX_CALLS}`);
      return done("strategies", calls, false);
    }
    case "strategy-subscribe": {
      const calls: Call[] = i.maxFeeBase > 0n ? [approveCall(vault.collateral, r, i.maxFeeBase)] : [];
      calls.push(registryCall(r, "subscribe", [i.strategyId, i.grantId, SUBSCRIPTION_MODES.indexOf(i.mode), i.maxFeeBase]));
      return done("strategies", calls, false);
    }
    case "strategy-pause":
      if (i.grantId <= 0n) return refuse("no grant to pause", "NoSuchGrant");
      return done("vault2", [vaultCall(v, "revoke", [i.grantId])], true);
    case "strategy-stop":
      if (i.grantId <= 0n) return done("strategies", [registryCall(r, "unsubscribe", [i.strategyId])], true);
      return done("strategies", [vaultCall(v, "revoke", [i.grantId]), registryCall(r, "unsubscribe", [i.strategyId])], true);
    case "strategy-unsubscribe":
      return done("strategies", [registryCall(r, "unsubscribe", [i.strategyId])], true);
    case "strategy-deactivate":
      return done("strategies", [registryCall(r, "deactivate", [i.strategyId])], true);
  }
}
