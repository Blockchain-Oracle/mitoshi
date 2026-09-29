/**
 * The stablecoin launch (plan B.5.1, D-025): the creator's one Tempo transaction of nine calls, the token address it
 * will create, and a reader that turns the batch receipt into per-call progress for the wizard.
 *
 *   1 TIP20_FACTORY.createToken(name, symbol, "USD", pathUSD, admin = creator, salt, logoURI)
 *   2 token.grantRole(ISSUER_ROLE, creator)     3 token.setSupplyCap(cap) (optional)     4 token.mint(creator, supply)
 *   5 STABLECOIN_DEX.createPair(token)
 *   6 placeFlip(token, bid, true, bidTick, askTick)     7 placeFlip(token, ask, false, askTick, bidTick)
 *   8 FEE_MANAGER.mint(token, pathUSD, feeLiquidity, creator)     9 LaunchRegistry.recordStablecoin(token, metadataURI)
 *
 * No `approve` calls: the DEX and the FeeAMM pull through TIP-20 implicit approvals (TIP-1035). The creator signs it
 * (root or access key — spike X22: `createToken` is a precompile call, not CREATE); it is capital intake (flip escrow +
 * FeeAMM deposit), so the relay never sponsors it (`relay/policies/launch.ts`).
 * Docs: tempo docs protocol/tip20/spec (factory, address derivation), protocol/exchange/providing-liquidity (flip
 * orders, ticks), protocol/fees/spec-fee-amm (mint); viem `viem/tempo` Abis.
 */
import { type Address, type Hex, type PublicClient, decodeEventLog, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, slice } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { launchRegistryAbi } from "@cwf/clients/abis/LaunchRegistry";
import { type StablecoinLaunchInput, validateStablecoinLaunch } from "@cwf/core";

export const TIP20_PREFIX = "0x20c000000000000000000000";
/** TIP-20 roles: `ISSUER_ROLE = keccak256("ISSUER_ROLE")` (tip20 spec), the admin role is 0x00…00. */
export const ISSUER_ROLE: Hex = keccak256(new TextEncoder().encode("ISSUER_ROLE"));

/**
 * `TIP20_FACTORY.getTokenAddress(creator, salt)` off-chain: `0x20c0 ‖ 00…00 ‖ top 8 bytes of keccak256(abi.encode(
 * creator, salt))`. The factory refuses addresses whose low 8 bytes are < 1000 (`AddressReserved`).
 */
export function predictTokenAddress(creator: Address, salt: Hex): Address {
  const lower = slice(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [creator, salt])), 0, 8);
  if (BigInt(lower) < 1000n) throw new Error("salt maps into the reserved TIP-20 range; pick another salt");
  return getAddress(`${TIP20_PREFIX}${lower.slice(2)}`);
}

/** A fresh random salt (the creator can't collide with themselves by accident). */
export function randomSalt(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export type StablecoinStep = "create" | "issuer" | "cap" | "mint" | "pair" | "bid" | "ask" | "feeLiquidity" | "record";
export interface BatchCall { step: StablecoinStep; to: Address; data: Hex }

export interface StablecoinBatch {
  token: Address;
  calls: BatchCall[];
}

/**
 * Builds the batch. Refuses (throws, with every reason) anything `validateStablecoinLaunch` rejects, so a wallet never
 * signs a batch the chain would revert.
 */
export function buildStablecoinBatch(p: StablecoinLaunchInput & { creator: Address; salt: Hex; registry: Address }): StablecoinBatch {
  const errors = validateStablecoinLaunch(p);
  if (errors.length) throw new Error(`stablecoin launch refused: ${errors.join("; ")}`);
  const token = predictTokenAddress(p.creator, p.salt);
  const pathUsd = getAddress(Addresses.pathUsd);
  const tip20 = (functionName: string, args: readonly unknown[]): Hex => encodeFunctionData({ abi: Abis.tip20, functionName, args } as never);
  const dex = (functionName: string, args: readonly unknown[]): Hex => encodeFunctionData({ abi: Abis.stablecoinDex, functionName, args } as never);

  const calls: BatchCall[] = [
    {
      step: "create",
      to: getAddress(Addresses.tip20Factory),
      data: encodeFunctionData({ abi: Abis.tip20Factory, functionName: "createToken", args: [p.name, p.symbol, "USD", pathUsd, p.creator, p.salt, p.logoURI] }),
    },
    { step: "issuer", to: token, data: tip20("grantRole", [ISSUER_ROLE, p.creator]) },
  ];
  if (p.supplyCap !== 0n) calls.push({ step: "cap", to: token, data: tip20("setSupplyCap", [p.supplyCap]) });
  calls.push(
    { step: "mint", to: token, data: tip20("mint", [p.creator, p.initialSupply]) },
    { step: "pair", to: getAddress(Addresses.stablecoinDex), data: dex("createPair", [token]) },
    { step: "bid", to: getAddress(Addresses.stablecoinDex), data: dex("placeFlip", [token, p.bidAmount, true, p.bidTick, p.askTick]) },
    { step: "ask", to: getAddress(Addresses.stablecoinDex), data: dex("placeFlip", [token, p.askAmount, false, p.askTick, p.bidTick]) },
    { step: "feeLiquidity", to: getAddress(Addresses.feeManager), data: encodeFunctionData({ abi: Abis.feeAmm, functionName: "mint", args: [token, pathUsd, p.feeLiquidity, p.creator] }) },
    { step: "record", to: p.registry, data: encodeFunctionData({ abi: launchRegistryAbi, functionName: "recordStablecoin", args: [token, p.metadataURI] }) },
  );
  return { token, calls };
}

/** Which log proves each step landed (per-call progress on the review screen). */
const PROOF: Record<StablecoinStep, { abi: readonly unknown[]; event: string }> = {
  create: { abi: Abis.tip20Factory, event: "TokenCreated" },
  issuer: { abi: Abis.tip20, event: "RoleMembershipUpdated" },
  cap: { abi: Abis.tip20, event: "SupplyCapUpdate" },
  mint: { abi: Abis.tip20, event: "Mint" },
  pair: { abi: Abis.stablecoinDex, event: "PairCreated" },
  bid: { abi: Abis.stablecoinDex, event: "OrderPlaced" },
  ask: { abi: Abis.stablecoinDex, event: "OrderPlaced" },
  feeLiquidity: { abi: Abis.feeAmm, event: "Mint" },
  record: { abi: launchRegistryAbi, event: "StablecoinRecorded" },
};

export interface StepProgress { step: StablecoinStep; done: boolean; args?: Record<string, unknown> }

/**
 * Reads a batch receipt into per-step progress. The batch is atomic, so on success every step is done; the decoded
 * event args (token, order ids, LP minted, registry index) are what the wizard shows beside each step.
 */
export function readStablecoinReceipt(batch: StablecoinBatch, receipt: { status: "success" | "reverted"; logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[] }): StepProgress[] {
  const used = new Set<number>();
  return batch.calls.map(({ step, to }) => {
    if (receipt.status !== "success") return { step, done: false };
    const proof = PROOF[step];
    const idx = receipt.logs.findIndex((log, i) => {
      if (used.has(i) || log.address.toLowerCase() !== to.toLowerCase()) return false;
      try {
        return decodeEventLog({ abi: proof.abi as never, data: log.data, topics: log.topics as never }).eventName === proof.event;
      } catch {
        return false;
      }
    });
    if (idx === -1) return { step, done: false };
    used.add(idx);
    const log = receipt.logs[idx]!;
    const decoded = decodeEventLog({ abi: proof.abi as never, data: log.data, topics: log.topics as never }) as unknown as { args: Record<string, unknown> };
    return { step, done: true, args: decoded.args };
  });
}

export interface StablecoinLaunchState {
  isTIP20: boolean;
  currency: string;
  quoteToken: Address;
  totalSupply: bigint;
  orders: { orderId: bigint; maker: Address; isBid: boolean; tick: number; flipTick: number; remaining: bigint; isFlip: boolean }[];
  /** FeeAMM pool (token → pathUSD): what lets the coin pay fees. */
  feePool: { reserveUserToken: bigint; reserveValidatorToken: bigint };
  registry: { kind: number; creator: Address; index: number; metadataURI: string };
}

/** Reads a launched stablecoin back from chain: token, DEX flip orders, FeeAMM reserves and the registry entry. */
export async function readStablecoinLaunch(client: PublicClient, p: { token: Address; registry: Address; orderIds: readonly bigint[] }): Promise<StablecoinLaunchState> {
  const pathUsd = getAddress(Addresses.pathUsd);
  const [isTIP20, currency, quoteToken, totalSupply, feePool, registry, orders] = await Promise.all([
    client.readContract({ address: Addresses.tip20Factory, abi: Abis.tip20Factory, functionName: "isTIP20", args: [p.token] }),
    client.readContract({ address: p.token, abi: Abis.tip20, functionName: "currency" }),
    client.readContract({ address: p.token, abi: Abis.tip20, functionName: "quoteToken" }),
    client.readContract({ address: p.token, abi: Abis.tip20, functionName: "totalSupply" }),
    client.readContract({ address: Addresses.feeManager, abi: Abis.feeAmm, functionName: "getPool", args: [p.token, pathUsd] }),
    client.readContract({ address: p.registry, abi: launchRegistryAbi, functionName: "launchOf", args: [p.token] }),
    Promise.all(p.orderIds.map(async (orderId) => ({ ...(await client.readContract({ address: Addresses.stablecoinDex, abi: Abis.stablecoinDex, functionName: "getOrder", args: [orderId] })), orderId }))),
  ]);
  return {
    isTIP20,
    currency,
    quoteToken: getAddress(quoteToken),
    totalSupply,
    orders: orders.map((o) => ({ orderId: o.orderId, maker: o.maker, isBid: o.isBid, tick: Number(o.tick), flipTick: Number(o.flipTick), remaining: BigInt(o.remaining), isFlip: o.isFlip })),
    feePool: { reserveUserToken: BigInt(feePool.reserveUserToken), reserveValidatorToken: BigInt(feePool.reserveValidatorToken) },
    registry: { kind: Number(registry.kind), creator: registry.creator, index: Number(registry.index), metadataURI: registry.metadataURI },
  };
}

/** Tokens the stablecoin launch touches, for callers outside `@cwf/markets` (scripts, ops). */
export const LAUNCH_PRECOMPILES = { pathUsd: getAddress(Addresses.pathUsd), tip20Factory: getAddress(Addresses.tip20Factory), stablecoinDex: getAddress(Addresses.stablecoinDex), feeManager: getAddress(Addresses.feeManager) } as const;
