// Cash out a private bet (S10d; Masayume 68f7a09:web/src/app/api/private/cashout): the claim and nothing else — the
// owner and every bet parameter live inside the desk-signed bytes, checked against the key the contract pins. Exits
// stay open everywhere (C.3.5).
import { privateCashoutRequestSchema, type PrivateClaim } from "@cwf/core/private";
import { cashOutPrivateBet, ClaimRefusedError } from "@cwf/markets/server";
import type { Hex } from "viem";
import { MissingConfigError, unavailable } from "@/server/env";
import { privateClaims, requireDesk } from "@/server/private";

export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };

export async function POST(req: Request): Promise<Response> {
  const parsed = privateCashoutRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "malformed private cash-out request" }, { status: 400, headers: noStore });
  try {
    const claim = parsed.data.claim as PrivateClaim;
    const result = await cashOutPrivateBet(requireDesk(), claim, parsed.data.signature as Hex);
    if (result.status !== "open") {
      const row = await privateClaims().get(claim.slotId);
      if (row?.ticket) {
        const credited = result.status === "credited" ? { payoutBase: result.payoutBase, creditedBase: result.creditedBase, ...(result.txs.credit ? { creditTx: result.txs.credit } : {}) } : { creditedBase: result.creditedBase };
        await privateClaims().markCredited(claim.slotId, { ...row.ticket, status: "credited", creditedAtMs: Date.now(), ...credited }, result as unknown as Record<string, unknown>, Date.now());
      }
    }
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    if (error instanceof ClaimRefusedError) return Response.json({ error: error.message }, { status: 403, headers: noStore });
    return Response.json({ error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) }, { status: 502, headers: noStore });
  }
}
