/**
 * The bridge adapters as indexer sources (R4-12, D-227; index/0007): one follower per deployed TIP20MintBurnAdapter,
 * each on its own cursor from its deploy block, through the same idempotent writer.
 */
import type { IndexWriter } from "@cwf/db/idx";
import { bridgeAdaptersOf, fetchAdapterEvents, type OpsClient } from "@cwf/markets/ops";
import type { VenueDeps } from "../../runtime";
import { sourceFollower, type SourceFollower } from "./follower";

export function bridgeFollowers(deps: Pick<VenueDeps, "bus">, client: OpsClient, writer: IndexWriter): SourceFollower[] {
  return bridgeAdaptersOf(client.chainId).map((a) => sourceFollower(deps, client, writer, { label: `bridge ${a.ticker}`, address: a.adapter, fromBlock: a.deployBlock, fetch: fetchAdapterEvents }));
}
