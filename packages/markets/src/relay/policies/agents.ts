/**
 * Relay policy for the `agents` area — the ERC-8004 IdentityRegistry on this chain (S9, D-218.7): a creator's agent
 * identity is the product's to give, so registering it and pointing it at its registration file are sponsored. Every
 * other identity call (transfers, metadata, the agent wallet) is the owner's own and not sponsored.
 * - `maxGas`: a register with a self-contained data: URI measured 1,730,534 on Moderato (house agent 7, S9.4; the URI is
 *   stored on chain); `setAgentURI` 157,701. 3M bounds a registration file of a few KB.
 */
import type { Abi, Address } from "viem";
import { ERC8004 } from "@cwf/clients";
import { identityRegistryAbi } from "../../agents/erc8004-abi";
import type { RelayPolicy } from "../types";

const targets: readonly Address[] = Object.values(ERC8004 as Record<number, { identity: Address }>).map((r) => r.identity);

export const agentsPolicy: RelayPolicy = {
  area: "agents",
  targets,
  abi: identityRegistryAbi as Abi,
  sponsor: ["register", "setAgentURI"],
  never: [],
  pillar: null,
  entry: [],
  maxGas: 3_000_000n,
};
