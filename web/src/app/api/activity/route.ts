// An account's money moves (RV-81, §8 "Money"): its pathUSD transfers since Mitoshi's first deployment, classified by
// counterparty (`@cwf/markets` `activityRows`). Public chain data — no session needed; limited per IP; never cached.
import { isAddress } from "viem";
import { activityReport } from "@/server/activity";
import { ceremonyLimiter } from "@/server/auth";
import { MissingConfigError, unavailable } from "@/server/env";
import { ipHash } from "@/server/request";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function GET(req: Request): Promise<Response> {
  const account = new URL(req.url).searchParams.get("account");
  if (!account || !isAddress(account)) return json({ error: "bad_account" }, 400);
  try {
    if (!(await ceremonyLimiter().allow(`activity:${ipHash(req)}`, 120, 60))) return json({ error: "rate_limited" }, 429);
    return json(await activityReport(account));
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return json({ error: "chain_unavailable", message: error instanceof Error ? error.message.split("\n")[0] : "unknown" }, 502);
  }
}
