/**
 * The indexer's vault sources (S7; S24.2): one follower per Trading Balance on the chain (v2, then v1), each with its own
 * cursor (`follower.ts`). Vault events go to the owner's `user:` topic (the web refreshes its Trading Balance).
 */
import type { IndexWriter } from "@cwf/db/idx";
import { fetchVaultEvents, vaultVenuesOf, type OpsClient } from "@cwf/markets/ops";
import type { VenueDeps } from "../../runtime";
import { sourceFollower, type SourceFollower } from "./follower";

export type VaultFollower = SourceFollower;

export function vaultFollowers(deps: Pick<VenueDeps, "bus">, client: OpsClient, writer: IndexWriter): VaultFollower[] {
  return vaultVenuesOf(client.chainId).map((v) => sourceFollower(deps, client, writer, { label: "vault", address: v.vault, fromBlock: v.deployBlock, fetch: fetchVaultEvents }));
}
