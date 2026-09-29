/**
 * Throwaway Moderato actors for the S4 drives: wallet files (0600, never printed), faucet funding
 * (`tempo_fundAddress`), and a liquidity maker that rests PostOnly quotes on a live Window with `cast batch-send`
 * (self-paid, the write boundary kept: scripts send through `cast` or `@cwf/markets`). The S3 house maker quotes one
 * Window a pass, so a drive that needs size brings its own resting liquidity — real orders on the real book.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, encodeFunctionData, erc20Abi, getAddress, http, type Address, type Hex } from "viem";
import { tempoChain } from "@cwf/markets";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { castBatch, PATH_USD, type CastReceipt } from "../../lib/cast";

export const RPC = process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz";
export const reader = createPublicClient({ chain: tempoChain("testnet"), transport: http(RPC) });
export const KEY_DIR = process.env.S4_KEY_DIR ?? join(tmpdir(), "s4-drive-keys");

export interface Wallet {
  file: string;
  address: Address;
  key: Hex;
}

export function wallet(name: string): Wallet {
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const file = join(KEY_DIR, `${name}-${Date.now()}.json`);
  writeFileSync(file, execFileSync("cast", ["wallet", "new", "--json"]).toString());
  chmodSync(file, 0o600);
  const d = (JSON.parse(readFileSync(file, "utf8")) as { data: { address: Address; private_key: Hex }[] }).data[0]!;
  return { file, address: getAddress(d.address), key: d.private_key };
}

export async function fund(address: Address): Promise<Hex[]> {
  const hashes = JSON.parse(execFileSync("cast", ["rpc", "tempo_fundAddress", address, "--rpc-url", RPC]).toString()) as Hex[];
  for (let i = 0; i < 30; i++) {
    if ((await reader.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [address] })) > 0n) return hashes;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`funding ${address} did not land`);
}

export const balanceOf = (a: Address) => reader.readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [a] });

export interface Quote {
  /** BUY_YES rests a YES bid at `yesTicks`; BUY_NO rests a YES ask at `yesTicks` (its own price is 1000 − yesTicks). */
  kind: 0 | 2;
  yesTicks: number;
  lots: bigint;
}

/** Rests PostOnly quotes from `maker` in one self-paid batch: one exact approve for the whole escrow, then the orders. */
export function restQuotes(maker: Wallet, engine: Address, marketId: Hex, expireTsSec: number, quotes: readonly Quote[]): CastReceipt {
  const escrow = quotes.reduce((s, q) => s + q.lots * BigInt(q.kind === 0 ? q.yesTicks : 1000 - q.yesTicks), 0n);
  const approve = { to: PATH_USD, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [engine, escrow] }) };
  const orders = quotes.map((q, i) => ({
    to: engine,
    data: encodeFunctionData({
      abi: eventsEngineAbi,
      functionName: "placeOrder",
      args: [{ marketId, kind: q.kind, orderType: 3, selfMatch: 0, priceTicks: q.yesTicks, lots: q.lots, expireTs: expireTsSec, maxFills: 16, maxEvictions: 16, useCredit: false, withdrawProceeds: false, clientId: BigInt(i + 1) }],
    }),
  }));
  const r = castBatch([approve, ...orders], { signer: { walletFile: maker.file } });
  if (r.status !== "0x1" && r.status !== "1" && r.status !== "success") throw new Error(`maker quotes reverted: ${r.transactionHash}`);
  return r;
}

/**
 * PostOnly prices that never cross (the engine refuses `PostOnlyWouldCross`): an ask one tick under the best ask (or
 * joining it when the spread is one tick), a bid one tick over the best bid, both strictly between the opposite sides.
 */
export function insideQuotes(top: { bidTicks: number; bidLots: bigint; askTicks: number; askLots: bigint }): { askYes: number; bidYes: number } {
  const bid = top.bidLots > 0n ? top.bidTicks : null;
  const ask = top.askLots > 0n ? top.askTicks : null;
  const askYes = ask !== null ? Math.max(ask - 1, (bid ?? 0) + 1) : Math.min((bid ?? 460) + 40, 998);
  const bidYes = bid !== null ? Math.min(bid + 1, askYes - 1) : Math.max(askYes - 40, 1);
  if (bid !== null && askYes <= bid) throw new Error(`ask ${askYes} would cross bid ${bid}`);
  if (ask !== null && bidYes >= ask) throw new Error(`bid ${bidYes} would cross ask ${ask}`);
  return { askYes, bidYes };
}

/**
 * Rests an ask and a bid inside the spread, re-reading the top and retrying when the house maker moved between the
 * read and the send (`PostOnlyWouldCross`); null after three tries (the Window is skipped).
 */
export async function restInside(maker: Wallet, engine: Address, marketId: Hex, expireTsSec: number, lots: { ask: bigint; bid: bigint }, readTop: () => Promise<{ bidTicks: number; bidLots: bigint; askTicks: number; askLots: bigint }>): Promise<{ receipt: CastReceipt; askYes: number; bidYes: number } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { askYes, bidYes } = insideQuotes(await readTop());
      return { receipt: restQuotes(maker, engine, marketId, expireTsSec, [{ kind: 2, yesTicks: askYes, lots: lots.ask }, { kind: 0, yesTicks: bidYes, lots: lots.bid }]), askYes, bidYes };
    } catch (error) {
      if (!/PostOnlyWouldCross|would cross|maker quotes reverted/.test(String(error))) throw error;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}
