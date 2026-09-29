/**
 * The wallet's balance sheet (plan C.2.2 `getBalanceSheet`): pathUSD in the wallet + engine credit + locked order cash
 * + `EventVault.accountOf`. The wallet half is read live now; the engine and vault halves join when those areas are
 * deployed (S4, S7). Before then they are genuinely empty — no engine exists that could hold credit — so the sheet
 * reports zero/none rather than guessing.
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
  if (isDeployed("engine", chainId) || isDeployed("vault", chainId)) {
    // The engine/vault readers land with their stages; a deployed area must never be read as empty.
    throw new Error("engine/vault balance readers are not wired on this build");
  }
  return { decimals: USD_DECIMALS, spendableBase, orderEscrowBase: 0n, engineCreditBase: 0n, engineCreditByMarket: [], vaultBase: null };
}
