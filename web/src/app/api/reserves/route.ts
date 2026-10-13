// Reserve history for `/reserves` (S14 14o; D-227 R4-12): ops `reserve-watch`'s newest snapshot per ticker (its
// ISSUER_ROLE holder set is the browser re-check's scan cursor), 30 days of per-day verdicts and the alert log.
// The live figures themselves are read in the browser from the chains; this is the record. Public data.
import { connection } from "next/server";
import { publicSnapshot, reserveStore } from "@/server/bridge";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";

const noStore = { "cache-control": "no-store" };
const DAYS = 30;

export async function GET(): Promise<Response> {
  await connection();
  try {
    const network = serverEnv().network;
    const store = reserveStore();
    const [latest, days, alerts] = await Promise.all([store.latest(network), store.days(network, Date.now() - DAYS * 86_400_000), store.alerts(network, 20)]);
    return Response.json({ latest: latest.map(publicSnapshot), days, alerts: alerts.map(publicSnapshot) }, { headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) }, { status: 502, headers: noStore });
  }
}
