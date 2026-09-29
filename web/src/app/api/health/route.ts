import { connection } from "next/server";
import { NETWORKS, networkFrom } from "@cwf/core";

/** Liveness for the deployment, evaluated per request; no secrets, no chain calls. */
export async function GET(): Promise<Response> {
  await connection();
  const network = networkFrom(process.env.NETWORK);
  return Response.json(
    { ok: true, network, chainId: NETWORKS[network], commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
