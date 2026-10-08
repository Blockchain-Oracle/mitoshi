/**
 * The desk service's chain half (server only — Ported from Masayume 68f7a09:packages/markets/src/private/{desk-client,
 * desk-open,desk-cashout,desk-health}.ts): one key (the testnet `desk` role, D-176) sending self-paid Tempo
 * transactions (never the relay, C.3.8), each step skipped when the contract already shows it landed, so a lost reply
 * is answered by sending the same request again. The keys come from the owner's secret (C.2.4, `keys.ts`); the claim
 * is EIP-712 over this contract (PD-4), verified against the contract's pinned `desk()`.
 */
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { Addresses } from "viem/tempo";
import { SIDE_TO_OUTCOME, type Diagnosis, type MarketId, type Network, type Side } from "@cwf/core";
import { PRIVATE_NOT_DEPLOYED, privateAuthFresh, type PrivateCashoutResult, type PrivateClaim, type PrivateOpenResult, type PrivateStatus, type PrivateTicket } from "@cwf/core/private";
import { formatBaseUnits } from "@cwf/core/units";
import { privateDeskAbi } from "@cwf/clients/abis/PrivateDesk";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { createOpsClient, type OpsClient } from "../ops/client";
import { sendOps } from "../ops/send";
import { fetchMarkets, fetchSeries, venueOf } from "../ops/venue";
import { claimDomain, signPrivateClaim, verifyPrivateClaim } from "./claim";
import { privateDeskOf } from "./deployment";
import { diagnosePrivate } from "./errors";
import { deriveSlotKeys } from "./keys";
import { toPrivateSlot } from "./read";

export interface Desk {
  ops: OpsClient;
  contract: Address;
  address: Address;
  chainId: number;
  locks: Map<string, Promise<unknown>>;
}

export function createDesk(input: { network: Network; privateKey: Hex; rpcUrl?: string }): Desk | null {
  const ops = createOpsClient({ network: input.network, privateKey: input.privateKey, ...(input.rpcUrl ? { rpcUrl: input.rpcUrl } : {}), tier: 1 });
  const d = privateDeskOf(ops.chainId);
  if (!d || !ops.address) return null;
  return { ops, contract: d.privateDesk, address: ops.address, chainId: ops.chainId, locks: new Map() };
}

/** One request at a time per slot: two racing replies of the same open would otherwise both try to charge. */
async function withSlotLock<T>(desk: Desk, slotId: string, run: () => Promise<T>): Promise<T> {
  const prev = desk.locks.get(slotId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(run);
  desk.locks.set(slotId, next);
  try {
    return await next;
  } finally {
    if (desk.locks.get(slotId) === next) desk.locks.delete(slotId);
  }
}

export interface WindowFacts {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  lockAtSec: number;
}

/** The chain's own Window — what the route rebuilds the signed text from, never the caller's strings. Null: unknown id. */
export async function windowFacts(desk: Desk, marketId: MarketId): Promise<WindowFacts | null> {
  const venue = venueOf(desk.chainId);
  if (!venue) throw new Error("no venue on this chain");
  const [m] = await fetchMarkets(desk.ops, venue, [marketId as Hex]);
  if (!m) return null;
  const seriesId = (await desk.ops.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "seriesIdAt", args: [m.seriesIdx] })) as Hex;
  const [s] = await fetchSeries(desk.ops, venue, [seriesId]);
  if (!s) return null;
  return { marketId, asset: s.symbol ?? `#${s.ticker}`, intervalSec: s.cadenceSec, expirySec: m.expirySec, lockAtSec: m.lockAtSec };
}

/** A named refusal from the desk contract, caught in simulation before anything is paid for. */
export class DeskRefusal extends Error {
  constructor(readonly diagnosis: Diagnosis) {
    super(diagnosis.technical);
    this.name = "DeskRefusal";
  }
}

/** Simulates as the desk (a revert comes back by the desk's own error name), then sends self-paid. */
async function send(desk: Desk, fn: string, args: readonly unknown[]): Promise<Hex> {
  try {
    await desk.ops.public.simulateContract({ account: desk.address, address: desk.contract, abi: privateDeskAbi, functionName: fn as never, args: args as never });
  } catch (error) {
    const d = diagnosePrivate(error);
    if (d.errorName) throw new DeskRefusal(d);
    throw error;
  }
  const data = encodeFunctionData({ abi: privateDeskAbi, functionName: fn as never, args: args as never });
  return (await sendOps(desk.ops, [{ to: desk.contract, data }], { simulate: false })).hash;
}

async function readState(desk: Desk, owner: Address, chargeKey: Hex, creditKey: Hex, slotId: Hex) {
  const c = { address: desk.contract, abi: privateDeskAbi } as const;
  const [charged, slot, budget, paused, credited, pinned] = await desk.ops.public.multicall({
    allowFailure: false,
    contracts: [
      { ...c, functionName: "chargedOf", args: [owner, chargeKey] },
      { ...c, functionName: "slotOf", args: [slotId] },
      { ...c, functionName: "budgetOf", args: [owner] },
      { ...c, functionName: "paused" },
      { ...c, functionName: "creditedOf", args: [owner, creditKey] },
      { ...c, functionName: "desk" },
    ],
  });
  const [balance, allowance] = budget as readonly [bigint, bigint];
  return { charged: charged as bigint, slot: toPrivateSlot(slotId, slot as Parameters<typeof toPrivateSlot>[1]), balance, allowance, paused: paused as boolean, credited: credited as bigint, pinned: pinned as Address };
}

const refundTxs = (t: Partial<Record<"charge" | "fund" | "mint" | "sweep" | "credit", Hex>>) => ({ ...(t.charge ? { charge: t.charge } : {}), ...(t.fund ? { fund: t.fund } : {}), ...(t.sweep ? { sweep: t.sweep } : {}), ...(t.credit ? { credit: t.credit } : {}) });
const pendingTxs = (t: Partial<Record<"charge" | "fund" | "mint" | "sweep" | "credit", Hex>>) => ({ ...(t.charge ? { charge: t.charge } : {}), ...(t.fund ? { fund: t.fund } : {}), ...(t.mint ? { mint: t.mint } : {}) });
const first = (t: string) => t.split("\n")[0]?.trim() || "the desk could not complete this";

export interface DeskOpenInput {
  owner: Address;
  marketId: MarketId;
  side: Side;
  stakeBase: bigint;
  minQuantityRaw: bigint;
  secret: Hex;
  issuedAtMs: number;
  asset: string;
  intervalSec: number;
  expirySec: number;
}

/** charge → fund → mint, a state machine over chain state; a mint the book refuses is refunded on the spot. */
export async function openPrivateBet(desk: Desk, input: DeskOpenInput): Promise<PrivateOpenResult> {
  const keys = deriveSlotKeys(input.secret);
  const usd = (b: bigint) => `$${formatBaseUnits(b, 6)}`;
  return withSlotLock(desk, keys.slotId, async () => {
    const txs: Partial<{ charge: Hex; fund: Hex; mint: Hex; sweep: Hex; credit: Hex }> = {};
    let s = await readState(desk, input.owner, keys.chargeKey, keys.creditKey, keys.slotId);
    try {
      if (s.charged === 0n) {
        if (!privateAuthFresh(input.issuedAtMs, Date.now())) return { status: "refused", reason: "That authorisation has expired — confirm again.", technical: "auth expired", refundedBase: "0", txs: refundTxs(txs) };
        if (s.paused) return { status: "refused", reason: "Private mode is paused right now. Nothing was taken.", technical: "IsPaused()", refundedBase: "0", txs: refundTxs(txs) };
        if (s.balance < input.stakeBase) return { status: "refused", reason: `Your private balance is ${usd(s.balance)}; this bet needs ${usd(input.stakeBase)}.`, technical: "Insufficient", refundedBase: "0", txs: refundTxs(txs) };
        if (s.allowance < input.stakeBase) return { status: "refused", reason: `Your private limit has ${usd(s.allowance)} left; this bet needs ${usd(input.stakeBase)}.`, technical: "OverAllowance", refundedBase: "0", txs: refundTxs(txs) };
        try {
          const p = (await desk.ops.public.readContract({ address: desk.contract, abi: privateDeskAbi, functionName: "sizeForStake", args: [input.marketId as Hex, SIDE_TO_OUTCOME[input.side], input.stakeBase] })) as { quantityRaw: bigint };
          if (p.quantityRaw < input.minQuantityRaw) return { status: "refused", reason: "The book moved under your quote. Nothing was taken — quote again.", technical: `sizeForStake ${p.quantityRaw} < guard ${input.minQuantityRaw}`, refundedBase: "0", txs: refundTxs(txs) };
        } catch (error) {
          return { status: "refused", reason: "The desk can't place this bet on the book right now. Nothing was taken.", technical: first(diagnosePrivate(error).technical), refundedBase: "0", txs: refundTxs(txs) };
        }
        txs.charge = await send(desk, "chargeToPool", [input.owner, input.stakeBase, keys.chargeKey]);
        s.charged = input.stakeBase;
      }
      if (s.slot.fundedAtSec === 0) {
        txs.fund = await send(desk, "fundSlot", [keys.slotId, s.charged]);
      } else if (s.slot.mintedAtSec === 0 && s.slot.balanceBase === 0n) {
        const owedCredit = s.slot.sweptBase - s.credited;
        if (owedCredit > 0n) txs.credit = await send(desk, "creditFromPool", [input.owner, owedCredit, keys.creditKey]);
        return { status: "refused", reason: "This bet was already refunded to your private balance.", technical: "slot swept", refundedBase: s.slot.sweptBase.toString(), txs: refundTxs(txs) };
      }
      if (s.slot.mintedAtSec === 0) {
        try {
          txs.mint = await send(desk, "mintInSlot", [keys.slotId, input.marketId as Hex, SIDE_TO_OUTCOME[input.side], input.minQuantityRaw]);
        } catch (error) {
          if (!(error instanceof DeskRefusal)) throw error;
          const sweep = await send(desk, "sweepSlotToPool", [keys.slotId]);
          const credit = await send(desk, "creditFromPool", [input.owner, s.charged, keys.creditKey]);
          return { status: "refused", reason: "The book refused the fill. Your stake is back in your private balance.", technical: first(error.diagnosis.technical), refundedBase: s.charged.toString(), txs: { ...refundTxs(txs), sweep, credit } };
        }
      }
      s = await readState(desk, input.owner, keys.chargeKey, keys.creditKey, keys.slotId);
      const claim: PrivateClaim = { owner: input.owner, slotId: keys.slotId, creditKey: keys.creditKey, marketId: input.marketId, outcomeIdx: SIDE_TO_OUTCOME[input.side], stakeBase: s.charged.toString(), issuedAtMs: Date.now() };
      const signature = await signPrivateClaim(desk.ops.wallet as unknown as Parameters<typeof signPrivateClaim>[0], claimDomain(desk.chainId, desk.contract), claim);
      const ticket: PrivateTicket = {
        claim,
        signature,
        desk: desk.address,
        contract: desk.contract,
        chainId: desk.chainId,
        asset: input.asset,
        intervalSec: input.intervalSec,
        expirySec: input.expirySec,
        quantityRaw: s.slot.quantityRaw.toString(),
        costBase: s.slot.costBase.toString(),
        txs: { charge: txs.charge ?? "0x", fund: txs.fund ?? "0x", mint: txs.mint ?? "0x" },
        openedAtMs: claim.issuedAtMs,
        status: "open",
      };
      return { status: "opened", ticket };
    } catch (error) {
      if (error instanceof DeskRefusal) return { status: "refused", reason: "The desk refused this step. Anything taken is still yours — send the same request again to finish or refund it.", technical: first(error.diagnosis.technical), refundedBase: "0", txs: refundTxs(txs) };
      return { status: "unknown", reason: first(diagnosePrivate(error).technical), txs: pendingTxs(txs) };
    }
  });
}

export class ClaimRefusedError extends Error {}

/** Settle (anyone), sweep the slot to the pool, credit the owner — each step skipped when it already landed. */
export async function cashOutPrivateBet(desk: Desk, claim: PrivateClaim, signature: Hex): Promise<PrivateCashoutResult> {
  return withSlotLock(desk, claim.slotId, async () => {
    let s = await readState(desk, claim.owner, "0x".padEnd(66, "0") as Hex, claim.creditKey, claim.slotId);
    if (!(await verifyPrivateClaim(claimDomain(desk.chainId, desk.contract), claim, signature, s.pinned))) throw new ClaimRefusedError("this claim was not signed by the desk the contract pins");
    if (s.slot.fundedAtSec === 0) throw new ClaimRefusedError("no such slot on this desk");
    const txs: Partial<{ settle: Hex; sweep: Hex; credit: Hex }> = {};
    if (s.slot.quantityRaw > 0n && s.slot.marketId) {
      const venue = venueOf(desk.chainId);
      if (!venue) throw new Error("no venue on this chain");
      const lens = { address: venue.lens, abi: engineLensAbi } as const;
      const [resolved, voided] = await desk.ops.public.multicall({ allowFailure: false, contracts: [{ ...lens, functionName: "isResolved", args: [s.slot.marketId as Hex] }, { ...lens, functionName: "isVoided", args: [s.slot.marketId as Hex] }] });
      if (!resolved && !voided) return { status: "open", expirySec: s.slot.expirySec };
      txs.settle = await send(desk, "settleSlot", [claim.slotId]);
      s = await readState(desk, claim.owner, "0x".padEnd(66, "0") as Hex, claim.creditKey, claim.slotId);
    }
    if (s.slot.balanceBase > 0n) {
      txs.sweep = await send(desk, "sweepSlotToPool", [claim.slotId]);
      s = await readState(desk, claim.owner, "0x".padEnd(66, "0") as Hex, claim.creditKey, claim.slotId);
    }
    const owedCredit = s.slot.sweptBase - s.credited;
    if (owedCredit > 0n) txs.credit = await send(desk, "creditFromPool", [claim.owner, owedCredit, claim.creditKey]);
    if (Object.keys(txs).length === 0) return { status: "done", creditedBase: s.credited.toString() };
    return { status: "credited", payoutBase: s.slot.payoutBase.toString(), creditedBase: (s.credited + (owedCredit > 0n ? owedCredit : 0n)).toString(), txs };
  });
}

/** An open is three self-paid sends, a refund two more; the desk key must hold at least this in pathUSD for fees. */
export const DESK_MIN_FEE_BALANCE_BASE = 100_000n;

/** Whether the private route can run right now, and every reason it cannot (the status route; the control gates on `ready`). */
export async function deskHealth(desk: Desk | null, chainId: number): Promise<PrivateStatus> {
  const d = privateDeskOf(chainId);
  const reasons: string[] = [];
  const base: PrivateStatus = { ready: false, reasons, mode: "desk-signed-slot", desk: null, contract: d?.privateDesk ?? null, chainId, minStakeBase: null, maxStakeBase: null, paused: false };
  if (!d) reasons.push(PRIVATE_NOT_DEPLOYED);
  if (!desk) reasons.push("no desk key is configured on this deployment (DESK_PRIVATE_KEY)");
  if (!d || !desk) return base;
  const c = { address: desk.contract, abi: privateDeskAbi } as const;
  try {
    const [pinned, paused, params, feeBase] = await desk.ops.public.multicall({
      allowFailure: false,
      contracts: [
        { ...c, functionName: "desk" },
        { ...c, functionName: "paused" },
        { ...c, functionName: "params" },
        { address: Addresses.pathUsd as Address, abi: erc20Abi, functionName: "balanceOf", args: [desk.address] },
      ],
    });
    const [minStake, maxStake] = params as readonly [bigint, bigint, number];
    if ((pinned as Address).toLowerCase() !== desk.address.toLowerCase()) reasons.push("the configured desk key is not the one the contract pins");
    if (paused) reasons.push("Private mode is paused on the contract");
    if ((feeBase as bigint) < DESK_MIN_FEE_BALANCE_BASE) reasons.push("the desk key holds too little pathUSD to pay for a bet's transactions");
    return { ...base, ready: reasons.length === 0, desk: pinned as Address, minStakeBase: minStake.toString(), maxStakeBase: maxStake.toString(), paused: paused as boolean };
  } catch {
    reasons.push("the desk could not read the contract right now");
    return base;
  }
}
