// A one-time message a wallet signs to ask for test funds (plan C.3.4). Passkey sign-ups never need it (D-046).
import { randomUUID } from "node:crypto";
import { faucetChallengeMessage, TEMPO_FAUCET_POLICY } from "@cwf/core/faucet";
import { isAddress } from "viem";
import { BRAND } from "@/lib/copy";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";
import { faucetStore, noFaucet } from "@/server/faucet";
import { regionRestricted, regionRestrictedResponse } from "@/server/region";
import { ipHash } from "@/server/request";

export async function POST(req: Request): Promise<Response> {
  const env = serverEnv();
  if (env.network !== "testnet") return noFaucet();
  if (regionRestricted(req, "markets")) return regionRestrictedResponse("markets");
  const body = (await req.json().catch(() => null)) as { wallet?: string } | null;
  if (!body?.wallet || !isAddress(body.wallet)) return Response.json({ error: "bad_wallet" }, { status: 400 });
  const nowMs = Date.now();
  const id = randomUUID();
  const expiresAtMs = nowMs + TEMPO_FAUCET_POLICY.challengeTtlMs;
  const message = faucetChallengeMessage({ brand: BRAND.name, origin: env.appOrigin, wallet: body.wallet, id, expiresAtMs });
  try {
    await faucetStore().saveChallenge({ id, wallet: body.wallet, ipHash: ipHash(req), message, createdAtMs: nowMs, expiresAtMs });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
  return Response.json({ id, message, expiresAtMs }, { headers: { "cache-control": "no-store" } });
}
