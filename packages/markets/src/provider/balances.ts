/**
 * The wallet's balance sheet (plan C.2.2 `getBalanceSheet`): pathUSD in the wallet + engine credit + locked order cash
 * + `EventVault.accountOf`. The wallet half is read live now; the engine and vault halves join with their readers
 * (S4, S7). Where an area isn't deployed its pool is genuinely empty (zero/none); where it is deployed but its reader
 * isn't wired yet, the pool is null ("not read"), never an invented zero.
 */
import { erc20Abi, type Address } from "viem";
import { USD_DECIMALS, type BalanceSheet } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { isDeployed } from "../deployments";
import { getPublicClient } from "../runtime/read-runtime";

export async function readBalanceSheet(wallet: Address): Promise<BalanceSheet> {
  const client = await getPublicClient();
  const spendableBase = await client.readContract({ address: TEMPO.pathUSD as Address, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
  const chainId = client.chain.id;
  // The Trading Balance is part of the headline total, so an unread vault must not read as empty (S7 wires it).
  if (isDeployed("vault", chainId)) throw new Error("the vault balance reader is not wired on this build");
  // Order escrow and engine credit are shown beside the headline, never added in: until S4's engine readers exist they
  // are reported as unread (null), not as zero.
  const engineLive = isDeployed("engine", chainId);
  return {
    decimals: USD_DECIMALS,
    spendableBase,
    orderEscrowBase: engineLive ? null : 0n,
    engineCreditBase: engineLive ? null : 0n,
    engineCreditByMarket: [],
    vaultBase: null,
  };
}
