/**
 * bridge-watch (S14 14o; D-227 R4-12): every 10 s while transfers are open, it follows each one the web recorded in
 * `bridge_messages` — leg 1's guid from LayerZero Scan by the source hash, the hop's onward leg by the compose
 * transaction on Base, a deferral in the delivery receipt (adapter `CreditDeferred` / lockbox `UnlockDeferred`) — and
 * stamps sent, verified and delivered per leg, so the ETA is a median of real transfers. A compose stored because the
 * Base float was empty is re-run (`EndpointV2.lzCompose`) once its composer can pay, with the stock-sync role key on
 * Base (testnet; DRY_RUN never sends). Every minute it reads the hop floats and says when one is under 5 hops.
 * Needs DATABASE_URL; reads only otherwise.
 */
import { etaOf, routeOf, type DeferReason, type ScanMessage } from "@cwf/core";
import { createPgBridgeStore, type BridgeMessageRow } from "@cwf/db";
import { createOpsClient } from "@cwf/markets/ops";
import { bridgeTopology, scanByTx, sideClients, type BridgeClients } from "@cwf/markets/stocks";
import { readHopFloats, receiptStatus, retryCompose, robinhoodDeferral, storedCompose, tempoDeferral, type HopFloat } from "@cwf/markets/stocks-ops";
import { errorText, roleKey, runActor, type VenueDeps } from "../../runtime";
import { advanceTransfer, type LegObservation, type Observation } from "./advance";

export const BRIDGE_WATCH_EVERY_MS = 10_000;
const IDLE_MS = 30_000;
const FLOAT_EVERY_PASSES = 6;
const LOW_FLOAT_HOPS = 5n;

export function startBridgeWatch(deps: VenueDeps): { stop: () => void } {
  if (!deps.sql) throw new Error("bridge-watch needs DATABASE_URL");
  const network = deps.env.network;
  const store = createPgBridgeStore(deps.sql);
  const tempo = createOpsClient({ network, rpcUrl: deps.env.tempoRpcUrl, tier: 2 }).public;
  const clients: BridgeClients = { network, tempo, ...sideClients(network, { robinhood: process.env.RH_RPC_HTTP_URL, base: process.env.BASE_SEPOLIA_RPC_HTTP_URL }) };
  const topo = bridgeTopology(network);
  const retryKey = roleKey("stock-sync", network, process.env, deps.env.keysDir);
  let passes = 0;
  let floats: HopFloat[] = [];
  const retried = new Set<string>();

  const follow = async (row: BridgeMessageRow, floatOf: (composer: string) => HopFloat | undefined): Promise<string | null> => {
    const route = routeOf(row.direction, network);
    const srcClient = row.srcChainId === clients.tempo.chain?.id ? clients.tempo : clients.robinhood;
    const src = await receiptStatus(srcClient, row.srcTx as `0x${string}`);
    const first = (await scanByTx(network, row.srcTx)).find((m) => m.srcEid === route.legs[0]!.srcEid) ?? null;
    const legs: LegObservation[] = [{ msg: first, deferral: null }];
    let bounced = false;
    let note: string | null = null;
    if (route.legs.length > 1 && first?.composeTx) {
      const onward = (await scanByTx(network, first.composeTx)).find((m) => m.srcEid === route.legs[1]!.srcEid) ?? null;
      bounced = onward !== null && onward.dstEid !== route.legs[1]!.dstEid;
      legs.push({ msg: onward, deferral: null });
    }
    const last = legs[route.legs.length - 1]?.msg ?? null;
    if (last && (last.status === "DELIVERED" || last.dstStatus === "SUCCEEDED") && last.dstTx) legs[route.legs.length - 1]!.deferral = await deferralOf(row, last);
    // A stored compose (empty float): re-run it once the composer can pay the onward leg.
    if (first && first.composeStatus && first.composeStatus !== "SUCCEEDED" && first.composeStatus !== "N/A" && first.dstTx && clients.base) {
      const c = await storedCompose(clients.base, first.dstTx);
      const f = c ? floatOf(c.to) : undefined;
      if (c?.pending && f && f.balanceWei >= f.onwardFeeWei && !retried.has(c.guid)) {
        if (deps.env.dryRun || !retryKey) note = `compose ${c.guid} can run now${deps.env.dryRun ? " (DRY: not sent)" : " (no stock-sync key)"}`;
        else {
          retried.add(c.guid);
          note = `re-ran compose ${c.guid}: ${await retryCompose({ privateKey: retryKey, rpcUrl: process.env.BASE_SEPOLIA_RPC_HTTP_URL, compose: c })}`;
        }
      } else if (c?.pending) note = `compose ${c.guid} waits on the ${f ? "Base float" : "composer"}`;
    }
    const eta = etaOf(await store.durations(network, row.direction));
    const obs: Observation = { src, legs, bounced };
    await store.advance(row.id, advanceTransfer(row, obs, eta, Date.now()), Date.now());
    return note;
  };

  async function deferralOf(row: BridgeMessageRow, last: ScanMessage): Promise<DeferReason | null> {
    const t = topo.tickers[row.ticker as keyof typeof topo.tickers];
    if (!t) return null;
    if (row.direction === "in" && t.adapter) return (await tempoDeferral(clients.tempo, last.dstTx!, t.adapter))?.reason ?? null;
    if (row.direction === "out" && t.lockbox) return (await robinhoodDeferral(clients.robinhood, last.dstTx!, t.lockbox))?.reason ?? null;
    return null;
  }

  const pass = async () => {
    passes += 1;
    if (passes % FLOAT_EVERY_PASSES === 1) floats = await readHopFloats(clients).catch(() => floats);
    const floatOf = (composer: string) => floats.find((f) => f.composer.toLowerCase() === composer.toLowerCase());
    const rows = await store.open(50);
    const notes: string[] = [];
    for (const row of rows) {
      try {
        const note = await follow(row, floatOf);
        if (note) notes.push(note);
      } catch (error) {
        await store.note(row.id, errorText(error), Date.now());
      }
    }
    const low = floats.filter((f) => f.balanceWei < f.onwardFeeWei * LOW_FLOAT_HOPS);
    const delivered = await store.lastDelivered(network);
    const medians = { in: etaOf(await store.durations(network, "in")), out: etaOf(await store.durations(network, "out")) };
    return {
      why: `${rows.length} open${low.length ? ` · float under ${LOW_FLOAT_HOPS} hops: ${low.map((f) => f.ticker).join(", ")}` : ""}${notes.length ? ` | ${notes.join(" | ")}` : ""}`,
      detail: { open: rows.length, floats: floats.map((f) => ({ ticker: f.ticker, composer: f.composer, balanceWei: f.balanceWei.toString(), onwardFeeWei: f.onwardFeeWei.toString() })), lowFloats: low.map((f) => f.ticker), lastDelivered: delivered, medians },
      nextDelayMs: rows.length ? BRIDGE_WATCH_EVERY_MS : IDLE_MS,
    };
  };
  return runActor({ name: "bridge-watch", log: deps.log, dryRun: deps.env.dryRun, everyMs: BRIDGE_WATCH_EVERY_MS, pass, critical: false });
}
