// Ported from Masayume 68f7a09:packages/markets/src/vault/{deployment,read}.ts — the deployment comes from our
// generated fragments (no forwarder, D-003), the grant tuple carries `caps.market` (D-091), and the holdings key on the
// vault's own `outcomeId(marketId, idx)` (the engine has no ERC-6909 ids).
/**
 * The Trading Balance's reads (plan C.2.2 `getVaultSnapshot` / `getVaultHoldings`): `EventVault.accountOf`, the live
 * grant per kind (`activeGrantOf` → `grantOf`) and what the vault holds for an owner on one Window (`positionOf` +
 * `positionGrantOf`), each in one Multicall3 round trip through the read runtime. Null where the vault isn't deployed.
 */
import { getAddress, keccak256, encodeAbiParameters, zeroHash, type Address, type Hex } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { grantKindOf, grantKindsOf, GRANT_KINDS, toMarketId, USD_DECIMALS, type GrantKind, type MarketId, type Reading, type VaultDeployment, type VaultGrant, type VaultHoldings, type VaultSnapshot } from "@cwf/core";
import { deploymentOf } from "../deployments";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";

const PATH_USD = "0x20C0000000000000000000000000000000000000" as Address;

/** Every Trading Balance on `chainId`, the current first (S24.2): v2 where deployed, then v1. Empty when none is. */
export function vaultDeploymentsOf(chainId: number): VaultDeployment[] {
  const v2 = deploymentOf("vault2", chainId)?.EventVaultV2;
  const v1 = deploymentOf("vault", chainId)?.EventVault;
  return [
    ...(v2 ? [{ chainId, eventVault: getAddress(v2.address), collateral: PATH_USD, fromBlock: BigInt(v2.deployBlock ?? 0), version: 2 as const }] : []),
    ...(v1 ? [{ chainId, eventVault: getAddress(v1.address), collateral: PATH_USD, fromBlock: BigInt(v1.deployBlock ?? 0), version: 1 as const }] : []),
  ];
}

/** The current Trading Balance on `chainId` — where every new deposit, grant and trade goes — or null (not deployed). */
export function vaultDeploymentOf(chainId: number): VaultDeployment | null {
  return vaultDeploymentsOf(chainId)[0] ?? null;
}

/** A previous Trading Balance still to empty (v1 once v2 is deployed), or null. */
export function legacyVaultDeploymentOf(chainId: number): VaultDeployment | null {
  const all = vaultDeploymentsOf(chainId);
  return all.length > 1 ? all[all.length - 1]! : null;
}

/** The deployment at `vault` (either version), or the current one when `vault` is absent. */
export function vaultDeploymentAt(chainId: number, vault?: Address | null): VaultDeployment | null {
  if (!vault) return vaultDeploymentOf(chainId);
  return vaultDeploymentsOf(chainId).find((d) => d.eventVault.toLowerCase() === vault.toLowerCase()) ?? null;
}

/** The vault's id for one side of a Window: `keccak256(abi.encode(marketId, outcomeIdx))` (VenueGateway.outcomeId). */
export function vaultOutcomeId(marketId: Hex, outcomeIdx: 0 | 1): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint8" }], [marketId, outcomeIdx])));
}

/** `grantOf` as viem decodes it. */
export interface GrantTuple {
  owner: Address;
  actor: Address;
  kind: number;
  revoked: boolean;
  expiresAtSec: bigint;
  spentDay: bigint;
  openPositions: number;
  caps: { maxStakePerTrade: bigint; maxDailySpend: bigint; maxOpenPositions: number; maxPriceRaw: bigint; market: Hex };
  budget: bigint;
  spentToday: bigint;
}

export function toVaultGrant(grantId: bigint, g: GrantTuple): VaultGrant {
  return {
    grantId,
    owner: g.owner.toLowerCase() as Address,
    actor: g.actor.toLowerCase() as Address,
    kind: grantKindOf(g.kind),
    revoked: g.revoked,
    expiresAtSec: Number(g.expiresAtSec),
    spentDay: Number(g.spentDay),
    spentTodayBase: g.spentToday,
    openPositions: g.openPositions,
    caps: {
      maxStakePerTradeBase: g.caps.maxStakePerTrade,
      maxDailySpendBase: g.caps.maxDailySpend,
      maxOpenPositions: g.caps.maxOpenPositions,
      maxPriceRaw: g.caps.maxPriceRaw,
      market: g.caps.market === zeroHash ? null : toMarketId(g.caps.market),
    },
    budgetBase: g.budget,
  };
}

/** The caps tuple the contract takes (`Caps`), from ours: a null scope is the contract's zero (any Window). */
export function capsTuple(caps: VaultGrant["caps"]) {
  return { maxStakePerTrade: caps.maxStakePerTradeBase, maxDailySpend: caps.maxDailySpendBase, maxOpenPositions: caps.maxOpenPositions, maxPriceRaw: caps.maxPriceRaw, market: (caps.market ?? zeroHash) as Hex };
}

async function vaultContext(vault?: Address | null) {
  const client = await getPublicClient();
  const deployment = vaultDeploymentAt(client.chain.id, vault);
  return { client, deployment, contract: deployment ? ({ address: deployment.eventVault, abi: eventVaultAbi } as const) : null };
}

/** One grant by id, live or not (a revoked or replaced grant stays readable for attribution). */
export async function readVaultGrant(grantId: bigint, vault?: Address | null): Promise<VaultGrant | null> {
  const { client, contract } = await vaultContext(vault);
  if (!contract) return null;
  const g = (await client.readContract({ ...contract, functionName: "grantOf", args: [grantId] })) as unknown as GrantTuple;
  return toVaultGrant(grantId, g);
}

/** The account and the live grant per kind, head-fresh: two batched reads. */
export async function readVaultSnapshot(wallet: Address, vault?: Address | null): Promise<VaultSnapshot | null> {
  const { client, deployment, contract } = await vaultContext(vault);
  if (!deployment || !contract) return null;
  const contracts = [
    { ...contract, functionName: "accountOf", args: [wallet] },
    // Only the kinds this version knows: v1 reverts on `exit` (its enum stops at `strategy`).
    ...grantKindsOf(deployment.version).map((_, i) => ({ ...contract, functionName: "activeGrantOf", args: [wallet, i] })),
  ];
  const [account, ...ids] = (await client.multicall({ allowFailure: false, contracts: contracts as never })) as unknown[];
  const live = (ids as bigint[]).map((id, i) => ({ kind: GRANT_KINDS[i] as GrantKind, id })).filter(({ id }) => id !== 0n);
  const tuples = live.length
    ? ((await client.multicall({ allowFailure: false, contracts: live.map(({ id }) => ({ ...contract, functionName: "grantOf" as const, args: [id] as const })) })) as unknown as GrantTuple[])
    : [];
  const grants: Record<GrantKind, VaultGrant | null> = { session: null, executor: null, strategy: null, exit: null };
  live.forEach(({ kind, id }, i) => {
    grants[kind] = toVaultGrant(id, tuples[i]!);
  });
  const a = account as unknown as { available: bigint; privateAvailable: bigint; totalDeposited: bigint; totalWithdrawn: bigint };
  return {
    deployment,
    account: { availableBase: a.available, privateAvailableBase: a.privateAvailable, totalDepositedBase: a.totalDeposited, totalWithdrawnBase: a.totalWithdrawn },
    grants,
    decimals: USD_DECIMALS,
  };
}

/** What the vault holds for `wallet` on one Window and which grant opened each side; zeros without a vault. */
export async function readVaultHoldings(wallet: Address, marketId: MarketId, vault?: Address | null): Promise<VaultHoldings> {
  const empty: VaultHoldings = { marketId, upRaw: 0n, downRaw: 0n, upGrantId: 0n, downGrantId: 0n };
  const { client, contract } = await vaultContext(vault);
  if (!contract) return empty;
  const [yes, no] = [vaultOutcomeId(marketId, 0), vaultOutcomeId(marketId, 1)];
  const [upRaw, downRaw, upGrantId, downGrantId] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { ...contract, functionName: "positionOf", args: [wallet, yes] },
      { ...contract, functionName: "positionOf", args: [wallet, no] },
      { ...contract, functionName: "positionGrantOf", args: [wallet, yes] },
      { ...contract, functionName: "positionGrantOf", args: [wallet, no] },
    ],
  })) as bigint[];
  return { marketId, upRaw: upRaw!, downRaw: downRaw!, upGrantId: upGrantId!, downGrantId: downGrantId! };
}

export const getVaultSnapshot = (wallet: Address): Promise<Reading<VaultSnapshot | null>> => withReading(`vault:${wallet.toLowerCase()}`, () => readVaultSnapshot(wallet));

export const getVaultHoldings = (wallet: Address, marketId: MarketId): Promise<Reading<VaultHoldings>> =>
  withReading(`vaultHoldings:${wallet.toLowerCase()}:${marketId}`, () => readVaultHoldings(wallet, marketId));
