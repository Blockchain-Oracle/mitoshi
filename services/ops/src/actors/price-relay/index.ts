/**
 * price-relay (plan C.5.2): RedStone → `recordPrint` for every due slot of every Window (the testnet source), Data
 * Streams on mainnet when credentials exist (Q-011), EIP-712 attestations opt-in (`RELAY_ATTESTED=1`, demo data), and
 * copy-open for back-to-back Windows. One key (`price-relay`, also the engine's ATTESTOR), one writer. The print archive
 * runs as its own actor (`archive`, S0) and the Gap's Friday open falls back to it past the gateway's history.
 */
import { privateKeyToAccount } from "viem/accounts";
import { chainNowSec, createOpsClient, feedIdToAscii, venueOf } from "@cwf/markets/ops";
import { runActor, roleKey, type VenueDeps } from "../../runtime";
import { BoundaryCache } from "./boundary-cache";
import { loadDataStreams } from "./proofs";
import { relayPass, type RelayState } from "./pass";

export function startPriceRelay(deps: VenueDeps): { stop: () => void } {
  const key = roleKey("price-relay", deps.env.network, process.env, deps.env.keysDir);
  const client = createOpsClient({ network: deps.env.network, rpcUrl: deps.env.tempoRpcUrl, privateKey: key, tier: 0 });
  const venue = venueOf(client.chainId);
  if (!venue) throw new Error(`no engine fragment for chain ${client.chainId}`);
  const dryRun = deps.env.dryRun || !key;
  if (!key) deps.log("PRICE_RELAY_PRIVATE_KEY / price-relay.json missing: scanning and reporting only");
  const state: RelayState = {
    client, venue, dryRun, series: [], listedMs: 0, low: new Map(), failures: new Map(), missed: new Set(), recent: [], log: deps.log,
    counters: { recorded: 0, copied: 0, already: 0, failed: 0, missed: 0 },
    proofs: {
      sources: deps.redstone, sql: deps.sql, engine: venue.engine, chainId: client.chainId, network: deps.env.network,
      attestor: key ? privateKeyToAccount(key) : null, attested: process.env.RELAY_ATTESTED === "1", datastreams: loadDataStreams(deps.env.network),
      cache: new BoundaryCache(deps.redstone, () => [...new Set(state.series.map((s) => feedIdToAscii(s.versions[0]?.primary.feedId ?? "0x")))]),
    },
  };
  deps.log(`relay ${client.address ?? "(no key)"}; RedStone via ${deps.redstone.gateways.join(", ")}; Data Streams ${state.proofs.datastreams ? "on" : "off (no credentials, Q-011)"}; attested ${state.proofs.attested ? "on (demo data)" : "off"}`);
  return runActor({ name: "price-relay", log: deps.log, dryRun, everyMs: 3_000, pass: async () => relayPass(state, await chainNowSec(client)) });
}
