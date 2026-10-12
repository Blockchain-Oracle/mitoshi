// The bridge tracker's records (S14 14o; D-227 R4-12). POST records a transfer the moment the source wallet returns
// its hash (before the receipt), so a killed tab, Recent and Portfolio's "In flight" row can find it; ops
// `bridge-watch` follows it from there. GET lists an address's transfers (sent or received) and the measured ETA per
// direction (medians of delivered transfers; none until one has been measured). Public chain data only; no gate.
import { connection } from "next/server";
import { BRIDGE_TICKERS, etaOf, isAddress, STOP_CHAIN_ID, type BridgeDirection } from "@cwf/core";
import { ceremonyLimiter } from "@/server/auth";
import { bridgeStore, publicTransfer } from "@/server/bridge";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";
import { ipHash } from "@/server/request";

const noStore = { "cache-control": "no-store" };
const HASH = /^0x[0-9a-fA-F]{64}$/;
const bad = (error: string) => Response.json({ error }, { status: 400, headers: noStore });
const failed = (error: unknown) => (error instanceof MissingConfigError ? unavailable(error) : Response.json({ error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) }, { status: 502, headers: noStore }));

export async function POST(req: Request): Promise<Response> {
  try {
    if (!(await ceremonyLimiter().allow(`bridge:${ipHash(req)}`, 30, 60))) return Response.json({ error: "too many transfers recorded; try again in a minute" }, { status: 429, headers: noStore });
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return bad("malformed transfer");
    const network = serverEnv().network;
    const direction = b.direction === "in" || b.direction === "out" ? (b.direction as BridgeDirection) : null;
    if (!direction) return bad("direction is in or out");
    if (!(BRIDGE_TICKERS as readonly unknown[]).includes(b.ticker)) return bad("unknown ticker");
    const srcChainId = STOP_CHAIN_ID[network][direction === "in" ? "robinhood" : "tempo"]!;
    if (b.srcChainId !== srcChainId) return bad(`a ${direction === "in" ? "bridge-in starts on Robinhood Chain" : "bridge-out starts on Tempo"} (${srcChainId})`);
    if (typeof b.srcTx !== "string" || !HASH.test(b.srcTx)) return bad("srcTx is a transaction hash");
    if (!isAddress(b.from) || !isAddress(b.to)) return bad("from and to are addresses");
    if (typeof b.amountSD !== "string" || !/^\d{1,30}$/.test(b.amountSD) || BigInt(b.amountSD) <= 0n) return bad("amountSD is a positive integer in 6 decimals");
    const row = await bridgeStore().track({ network, direction, ticker: b.ticker as string, srcChainId, srcTx: b.srcTx, sender: b.from, recipient: b.to, amountSD: BigInt(b.amountSD), nowMs: Date.now() });
    return Response.json({ transfer: publicTransfer(row) }, { headers: noStore });
  } catch (error) {
    return failed(error);
  }
}

export async function GET(req: Request): Promise<Response> {
  await connection();
  try {
    const address = new URL(req.url).searchParams.get("address");
    if (address !== null && !isAddress(address)) return bad("address is an address");
    const network = serverEnv().network;
    const store = bridgeStore();
    const [transfers, inSec, outSec] = await Promise.all([address ? store.listFor(address, 20) : Promise.resolve([]), store.durations(network, "in"), store.durations(network, "out")]);
    return Response.json({ transfers: transfers.map(publicTransfer), eta: { in: etaOf(inSec), out: etaOf(outSec) } }, { headers: noStore });
  } catch (error) {
    return failed(error);
  }
}
