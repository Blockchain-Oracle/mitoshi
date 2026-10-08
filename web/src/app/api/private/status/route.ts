// Whether the private route can run, and every reason it cannot (S10d; Masayume 68f7a09:web/src/app/api/private/status).
import { connection } from "next/server";
import { NETWORKS } from "@cwf/core";
import { deskHealth } from "@cwf/markets/server";
import { serverEnv } from "@/server/env";
import { privateDesk } from "@/server/private";

export async function GET(): Promise<Response> {
  await connection();
  const chainId = NETWORKS[serverEnv().network];
  return Response.json(await deskHealth(privateDesk(), chainId), { headers: { "cache-control": "no-store" } });
}
