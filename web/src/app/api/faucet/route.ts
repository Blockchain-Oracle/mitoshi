// Test funds (plan C.3.4). POST with no body funds the passkey session's address (the one-ceremony sign-up, D-046);
// POST {challengeId, signature} funds a wallet that signed the challenge. GET ?wallet= reports whether it may claim.
// Funding is a markets-pillar funded route: a held region gets 451 (C.3.5).
import { verifySignedMessage, type Address } from "@cwf/core";
import { faucetClaimView, TEMPO_FAUCET_POLICY, type FaucetStatus } from "@cwf/core/faucet";
import { messageVerifier } from "@cwf/markets/server";
import { isAddress } from "viem";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";
import { chainClient, claimFunds, faucetStore, noFaucet } from "@/server/faucet";
import { regionRestricted, regionRestrictedResponse } from "@/server/region";
import { ipHash } from "@/server/request";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };

async function guarded(run: () => Promise<Response>): Promise<Response> {
  if (serverEnv().network !== "testnet") return noFaucet();
  try {
    return await run();
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}

export function GET(req: Request): Promise<Response> {
  return guarded(async () => {
    const wallet = new URL(req.url).searchParams.get("wallet");
    if (!wallet || !isAddress(wallet)) return Response.json({ error: "bad_wallet" }, { status: 400 });
    const last = await faucetStore().lastFunded(wallet);
    const claim = last ? faucetClaimView(last) : null;
    const waiting = claim !== null && claim.nextClaimAtMs > Date.now();
    const restricted = regionRestricted(req, "markets");
    const status: FaucetStatus = {
      available: !restricted && !waiting,
      claim,
      reason: restricted ? "region_restricted" : waiting ? "cooldown" : "available",
    };
    return Response.json(status, { headers: noStore });
  });
}

export function POST(req: Request): Promise<Response> {
  return guarded(async () => {
    if (regionRestricted(req, "markets")) return regionRestrictedResponse("markets");
    const body = (await req.json().catch(() => ({}))) as { challengeId?: string; signature?: string };
    let wallet: Address;
    let auth: "passkey-session" | "signature";
    if (body.challengeId && body.signature) {
      const challenge = await faucetStore().takeChallenge(body.challengeId, Date.now());
      if (!challenge) return Response.json({ error: "challenge_expired", message: "That request expired. Ask again." }, { status: 410, headers: noStore });
      const ok = await verifySignedMessage({ text: challenge.message, signature: body.signature as `0x${string}`, signer: challenge.wallet }, messageVerifier(chainClient()));
      if (!ok) return Response.json({ error: "bad_signature", message: "The signature doesn't match this wallet." }, { status: 401, headers: noStore });
      wallet = challenge.wallet;
      auth = "signature";
    } else {
      const session = await callerSession(req);
      if (session?.kind !== "passkey") return Response.json({ error: "no_session", message: "Sign in with a passkey, or sign the request with your wallet." }, { status: 401, headers: noStore });
      wallet = session.address;
      auth = "passkey-session";
    }
    const outcome = await claimFunds({ wallet, auth, ipHash: ipHash(req), nowMs: Date.now() });
    if (!outcome.ok) return Response.json({ error: outcome.code, message: outcome.message, nextClaimAtMs: outcome.nextClaimAtMs ?? null }, { status: outcome.status, headers: noStore });
    return Response.json({ claim: outcome.claim, policy: { cooldownMs: TEMPO_FAUCET_POLICY.cooldownMs } }, { headers: noStore });
  });
}
