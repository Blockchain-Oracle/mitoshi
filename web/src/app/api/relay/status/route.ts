// The relay's public status (plan C.3.3): fee payer, balance, breaker, allowlist, today's budget. No secrets.
import { connection } from "next/server";
import { DEFAULT_LIMITS, POLICIES } from "@cwf/markets/server";
import { createPgLedger } from "@cwf/db";
import type { RelayStatus } from "@cwf/markets";
import { db } from "@/server/db";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";
import { NETWORKS } from "@cwf/core";
import { relayHandler } from "@/server/relay";

export async function GET(): Promise<Response> {
  await connection();
  try {
    const relay = relayHandler();
    const nowSec = Math.floor(Date.now() / 1000);
    const [balance, today] = await Promise.all([relay.balance(), createPgLedger(db()).totals({ sinceSec: nowSec - 86_400 })]);
    const status: RelayStatus = {
      chainId: NETWORKS[serverEnv().network],
      feePayer: relay.feePayer,
      balanceMicros: balance === null ? null : balance.toString(),
      breakerOpen: balance === null || balance < DEFAULT_LIMITS.breakerMinBalanceMicros,
      areas: POLICIES.map((p) => ({ area: p.area, targets: [...p.targets], sponsor: [...p.sponsor], never: [...p.never] })),
      today: { count: today.count, feeMicros: today.feeMicros.toString(), limitMicros: DEFAULT_LIMITS.globalFeePerDayMicros.toString() },
      recent: [...relay.lastVerdicts],
      asOfSec: nowSec,
    };
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}
