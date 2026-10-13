/**
 * Every send on Robinhood Chain or Base Sepolia (S14 14o/14w; D-227 R4-12) — the write boundary's second file (plan
 * C.1.2; Tempo sends stay in `tx/send.ts`). Nothing here holds a key: the user's bridge-in is signed by their linked
 * Robinhood wallet (a viem wallet client from the wallet runtime), and the two ops sends take the role key ops resolved.
 *
 * - `sendBridgeIn`: the linked wallet's calls in order (`approve(lockbox)` only when the allowance was short, then
 *   `lockbox.send{value: nativeFee}`), waiting for the approval's receipt before the send; resolves with the send's hash
 *   the moment the wallet returns it (the tracker records it before the receipt).
 * - `retryCompose`: re-runs a compose an empty Base float left stored (`EndpointV2.lzCompose`; the composer pays on).
 * - `claimOwed`: the linked wallet pulls what an unlock owed it on Robinhood Chain (`lockbox.claim()`).
 * - `sendStockSync`: the permissionless corporate-action push (`StockSyncSender.sync{value: fee}`).
 */
import { createWalletClient, http, type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LZ_EID, type Network } from "@cwf/core";
import { LAYERZERO } from "@cwf/clients";
import { iLayerZeroEndpointV2Abi } from "@cwf/clients/abis/ILayerZeroEndpointV2";
import { stockLockboxAbi } from "@cwf/clients/abis/StockLockbox";
import { stockSyncSenderAbi } from "@cwf/clients/abis/StockSyncSender";
import { baseSepolia, robinhoodTestnet } from "../chains";
import type { SideCall } from "./bridge";
import { bridgeTopology } from "./topology";
import type { StoredCompose, SyncPlan } from "./watch";

export type SideWallet = WalletClient<Transport, Chain, Account>;

export interface BridgeInProgress {
  /** "approve" while the allowance call is with the wallet or confirming; "send" for the bridge call itself. */
  onStep?: (step: "approve" | "send", hash: Hex | null) => void;
}

/** Sends the bridge-in calls from the linked wallet; returns the bridge (send) transaction hash. */
export async function sendBridgeIn(wallet: SideWallet, read: PublicClient, calls: readonly SideCall[], progress: BridgeInProgress = {}): Promise<Hex> {
  let last: Hex | null = null;
  for (const [i, call] of calls.entries()) {
    const final = i === calls.length - 1;
    progress.onStep?.(final ? "send" : "approve", null);
    const hash = await wallet.sendTransaction({ account: wallet.account, chain: wallet.chain, to: call.to, data: call.data, value: call.value });
    progress.onStep?.(final ? "send" : "approve", hash);
    if (!final) {
      const receipt = await read.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`the approval reverted (${hash})`);
    }
    last = hash;
  }
  if (!last) throw new Error("nothing to send");
  return last;
}

/** The linked wallet pulls an owed unlock (`StockLockbox.claim`, pays `msg.sender`); returns the hash. */
export async function claimOwed(wallet: SideWallet, lockbox: Address): Promise<Hex> {
  return wallet.writeContract({ account: wallet.account, chain: wallet.chain, address: lockbox, abi: stockLockboxAbi, functionName: "claim" });
}

const sideChain = (stop: "robinhood" | "base") => (stop === "robinhood" ? robinhoodTestnet : baseSepolia);

/** Re-runs a stored compose on Base with a role key (testnet only); the composer pays the onward fee itself. */
export async function retryCompose(input: { privateKey: Hex; rpcUrl?: string | undefined; compose: StoredCompose }): Promise<Hex> {
  const wallet = createWalletClient({ account: privateKeyToAccount(input.privateKey), chain: sideChain("base"), transport: http(input.rpcUrl) });
  const c = input.compose;
  return wallet.writeContract({ address: LAYERZERO[84532].endpoint as Address, abi: iLayerZeroEndpointV2Abi, functionName: "lzCompose", args: [c.from, c.to, c.guid, c.index, c.message, "0x"] });
}

/** Sends a planned push from the stock-sync key on Robinhood Chain; returns the source transaction. */
export async function sendStockSync(input: { network: Network; privateKey: Hex; rpcUrl?: string | undefined; plan: SyncPlan }): Promise<Hex> {
  const topo = bridgeTopology(input.network);
  if (!topo.sender) throw new Error("StockSyncSender is not deployed on Robinhood Chain");
  const wallet = createWalletClient({ account: privateKeyToAccount(input.privateKey), chain: sideChain("robinhood"), transport: http(input.rpcUrl) });
  return wallet.writeContract({ address: topo.sender, abi: stockSyncSenderAbi, functionName: "sync", args: [input.plan.stocks, LZ_EID.baseSepolia], value: input.plan.feeWei });
}
