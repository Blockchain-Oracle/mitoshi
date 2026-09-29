/**
 * S1 gate, faucet leg (plan C.3.4) for wallet sign-ins: a brand-new secp256k1 wallet asks for a challenge, signs it
 * (EIP-191), and claims. Moderato's `tempo_fundAddress` funds it; the script prints the funding tx hashes and then
 * proves the one-per-day cooldown and the one-time challenge. Passkey sign-ups skip the signature (the session proves
 * the address) and are covered by the onboarding e2e.
 *
 *   pnpm --filter @cwf/scripts exec tsx e2e/faucet-signed.ts [baseUrl]
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const base = process.argv[2] ?? "http://localhost:3101";
const account = privateKeyToAccount(generatePrivateKey());
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const challenge = (await (await post("/api/faucet/challenge", { wallet: account.address })).json()) as { id: string; message: string };
const signature = await account.signMessage({ message: challenge.message });
const claim = await post("/api/faucet", { challengeId: challenge.id, signature });
const funded = (await claim.json()) as { claim?: { txHashes: string[]; status: string; nextClaimAtMs: number } };
console.log(JSON.stringify({ leg: "funded", wallet: account.address, http: claim.status, ...funded.claim }));
if (claim.status !== 200 || funded.claim?.status !== "funded" || funded.claim.txHashes.length === 0) throw new Error("not funded");

const replay = await post("/api/faucet", { challengeId: challenge.id, signature });
console.log(JSON.stringify({ leg: "challenge-one-time", http: replay.status, ...((await replay.json()) as object) }));
if (replay.status !== 410) throw new Error("a used challenge was accepted");

const again = (await (await post("/api/faucet/challenge", { wallet: account.address })).json()) as { id: string; message: string };
const second = await post("/api/faucet", { challengeId: again.id, signature: await account.signMessage({ message: again.message }) });
console.log(JSON.stringify({ leg: "cooldown", http: second.status, ...((await second.json()) as object) }));
if (second.status !== 429) throw new Error("a second claim inside the cooldown was funded");

const wrong = privateKeyToAccount(generatePrivateKey());
const third = (await (await post("/api/faucet/challenge", { wallet: wrong.address })).json()) as { id: string; message: string };
const forged = await post("/api/faucet", { challengeId: third.id, signature: await account.signMessage({ message: third.message }) });
console.log(JSON.stringify({ leg: "wrong-signer", http: forged.status }));
if (forged.status !== 401) throw new Error("a signature by another wallet was accepted");
