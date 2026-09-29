/**
 * Test funds on Moderato (plan C.3.4; L-25): the node's own `tempo_fundAddress` sends 1,000,000 of each of four
 * testnet stablecoins and returns the transaction hashes. No key of ours is involved. Mainnet has no faucet (L-26).
 */
import type { Address, Hex, PublicClient } from "viem";
import { Actions } from "viem/tempo";
import { NETWORKS } from "@cwf/core";

export class FaucetUnavailableError extends Error {
  constructor() {
    super("there is no faucet on mainnet");
    this.name = "FaucetUnavailableError";
  }
}

export async function fundAddress(client: PublicClient, address: Address): Promise<Hex[]> {
  if (client.chain?.id !== NETWORKS.testnet) throw new FaucetUnavailableError();
  const hashes = await Actions.faucet.fund(client, { account: address });
  return [...hashes];
}
