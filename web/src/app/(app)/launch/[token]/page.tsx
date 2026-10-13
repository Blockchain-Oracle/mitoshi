// `/launch/<token>` (S17; R4-11, D-227): one launch — a memecoin's curve, trades and claims, or a stablecoin's supply and
// pair. R6 money (S02 + T16, D-230): a path that isn't an address, or an address that is no launch, is a 404 with the
// VOID ticket (`not-found.tsx` → `LaunchVoid`): the server asks the index first and, when the index hasn't seen the
// address (a seconds-old launch), the registry itself — so a fresh launch is never a 404. Then the page reads client-side.
import { NETWORKS } from "@cwf/core";
import { registryKindOf } from "@cwf/markets/launch";
import { tempoReadClient } from "@cwf/markets";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isAddress } from "viem";
import { TokenIsland } from "@/features/launch/islands";
import { DataGate } from "@/providers/data/DataGate";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import Loading from "./loading";

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  return { title: isAddress(token) ? `Launch ${token.slice(0, 6)}…${token.slice(-4)}` : "Launch" };
}

/** Known to the index, else to the registry; an unreadable index or chain lets the page decide (never a false 404). */
async function isLaunch(token: `0x${string}`): Promise<boolean> {
  try {
    const [row] = await db()<{ n: number }[]>`select 1 as n from idx_launches where token = ${token.toLowerCase()}`;
    if (row) return true;
  } catch {
    // the index is down: ask the chain
  }
  try {
    const env = serverEnv();
    const kind = await registryKindOf(tempoReadClient(env.network, env.rpcHttpUrl), NETWORKS[env.network], token);
    return kind === null || kind !== 0;
  } catch {
    return true;
  }
}

async function Token({ params }: { params: Params }) {
  const { token } = await params;
  if (!isAddress(token)) notFound();
  await connection();
  if (!(await isLaunch(token))) notFound();
  return (
    <DataGate fallback={<Loading />}>
      <TokenIsland token={token as `0x${string}`} />
    </DataGate>
  );
}

export default function LaunchTokenPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Loading />}>
      <Token params={params} />
    </Suspense>
  );
}
