/**
 * stock-sync (S14 14o; plan B.1.4 ST-05; D-227 R4-12): keeps the Tempo mirrors' ERC-8056 multiplier and status in step
 * with Robinhood Chain. Every 15 minutes it compares each Stock Token's `uiMultiplier`/`newUIMultiplier`/`effectiveAt`
 * with what `StockSyncReceiver` last applied (or a sync older than a day) and, when one differs, pays
 * `StockSyncSender.sync` on Robinhood Chain with the stock-sync role key (→ Base forwarder → Tempo receiver; anyone may
 * call it). Open pushes are marked delivered from LayerZero Scan. Until StockSyncSender is deployed on Robinhood testnet
 * (it waits on the owner's test ETH, owner-actions S14c) it idles and says so. DRY_RUN plans and never sends.
 */
import { createPgStockSyncStore } from "@cwf/db";
import { createOpsClient } from "@cwf/markets/ops";
import { bridgeTopology, scanByTx, sideClients, type BridgeClients } from "@cwf/markets/stocks";
import { planStockSync, sendStockSync } from "@cwf/markets/stocks-ops";
import { roleKey, runActor, type VenueDeps } from "../../runtime";

export const STOCK_SYNC_EVERY_MS = 15 * 60_000;
const MAX_SYNC_AGE_SEC = 24 * 3600;

export function startStockSync(deps: VenueDeps): { stop: () => void } {
  const network = deps.env.network;
  const store = deps.sql ? createPgStockSyncStore(deps.sql) : null;
  const tempo = createOpsClient({ network, rpcUrl: deps.env.tempoRpcUrl, tier: 2 }).public;
  const clients: BridgeClients = { network, tempo, ...sideClients(network, { robinhood: process.env.RH_RPC_HTTP_URL, base: process.env.BASE_SEPOLIA_RPC_HTTP_URL }) };
  const key = roleKey("stock-sync", network, process.env, deps.env.keysDir);

  const pass = async () => {
    if (!bridgeTopology(network).sender) return { why: "idle: StockSyncSender is not deployed on Robinhood Chain yet (owner-actions S14c test ETH)" };
    let delivered = 0;
    for (const open of store ? await store.open(network) : []) {
      // Two legs: Robinhood → the Base forwarder, whose receive sends it on to Tempo. Delivered once the onward one is.
      const [first] = await scanByTx(network, open.srcTx);
      const [onward] = first?.status === "DELIVERED" && first.dstTx ? await scanByTx(network, first.dstTx) : [];
      if (onward?.status === "DELIVERED") {
        await store!.mark(open.id, "delivered", null, Date.now(), (onward.dstAtSec ?? Math.floor(Date.now() / 1000)) * 1000);
        delivered += 1;
      }
    }
    const plan = await planStockSync(clients, MAX_SYNC_AGE_SEC, Math.floor(Date.now() / 1000));
    if (!plan) return { why: `in step${delivered ? ` · ${delivered} push(es) delivered` : ""}` };
    if (deps.env.dryRun || !key) return { why: `${plan.stocks.length} token(s) to push, fee ${plan.feeWei} wei${deps.env.dryRun ? " (DRY: not sent)" : " (no stock-sync key)"}` };
    const tx = await sendStockSync({ network, privateKey: key, rpcUrl: process.env.RH_RPC_HTTP_URL, plan });
    await store?.record({ network, srcTx: tx, guid: null, seq: null, tokens: plan.stocks, feeWei: plan.feeWei, nowMs: Date.now() });
    return { why: `pushed ${plan.stocks.length} token(s): ${tx}`, detail: { lastPush: tx } };
  };
  return runActor({ name: "stock-sync", log: deps.log, dryRun: deps.env.dryRun, everyMs: STOCK_SYNC_EVERY_MS, pass, critical: false });
}
