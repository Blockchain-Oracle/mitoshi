/**
 * The trust surface's chain half, live on Moderato (S1 settings step): a funded root account authorises a real P-256
 * access key with a pathUSD limit, the scanner finds it from events, the precompile reports it active with its
 * remaining limit, and revoking it through OUR relay (sponsored: an exit never needs funds, D-053) flips it to revoked.
 * Needs the web app running for the relay: `LIVE_RELAY_URL` (default http://localhost:3101/api/relay).
 */
import { P256 } from "ox";
import { createPublicClient, createWalletClient, encodeFunctionData, http, type Address } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { Account, Actions } from "viem/tempo";
import { describe, expect, it } from "vitest";
import { TEMPO_RPC_HTTP } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { PATH_USD, tempoChain } from "../chains";
import { tempoTransport } from "../transports";
import { sendBatch } from "../tx/send";
import { withAuthorizedLimits } from "./authorization";
import { foldKeychain } from "./fold";
import { keyStatus, readKeyStates } from "./live";
import { scanKeychain } from "./events";
import { accountKeychainAbi } from "./keychain-abi";

const chain = tempoChain("testnet");
const client = createPublicClient({ chain, transport: http(TEMPO_RPC_HTTP.testnet) });
const relayUrl = process.env.LIVE_RELAY_URL ?? "http://localhost:3101/api/relay";

describe("keychain trust surface on Moderato", () => {
  it("authorise → scan → live limit → sponsored revoke → revoked", async () => {
    const root = Account.fromSecp256k1(generatePrivateKey());
    const funded = await Actions.faucet.fund(client, { account: root.address });
    await Promise.all(funded.map((hash) => client.waitForTransactionReceipt({ hash })));
    const wallet = createWalletClient({ account: root, chain, transport: tempoTransport({ rpcHttpUrls: [TEMPO_RPC_HTTP.testnet], relayUrl }) });
    const keyId = Account.fromP256(P256.randomPrivateKey()).address as Address;
    const start = await client.getBlockNumber();
    const nowSec = Math.floor(Date.now() / 1000);

    // The 3-argument overload (0x980a6025): Moderato retired the legacy 5-argument selector (LegacyAuthorizeKeySelectorChanged).
    // KeyRestrictions; "expiry" (unix seconds) is the precompile's own field name.
    const config = { "expiry": BigInt(nowSec + 86_400), enforceLimits: true, limits: [{ token: PATH_USD, amount: 25_000_000n, period: 86_400n }], allowAnyCalls: true, allowedCalls: [] };
    const authorize = encodeFunctionData({ abi: accountKeychainAbi, functionName: "authorizeKey", args: [keyId, 1, config] });
    const auth = await sendBatch(wallet as never, { calls: [{ to: TEMPO.accountKeychain as Address, data: authorize }], sponsored: false, nonce: { kind: "protocol" }, nowSec });
    expect(auth.receipt.status).toBe("success");

    const head = await client.getBlockNumber();
    const history = await withAuthorizedLimits(client as never, foldKeychain(await scanKeychain(client as never, root.address, start, head)));
    expect(history.map((k) => k.keyId.toLowerCase())).toEqual([keyId.toLowerCase()]);
    const [state] = await readKeyStates(client as never, root.address, history);
    expect(keyStatus(state!, BigInt(nowSec))).toBe("active");
    expect(state!.tokens).toMatchObject([{ token: PATH_USD, limit: 25_000_000n, period: 86_400n, remaining: 25_000_000n }]);

    const revoke = encodeFunctionData({ abi: accountKeychainAbi, functionName: "revokeKey", args: [keyId] });
    const rev = await sendBatch(wallet as never, { calls: [{ to: TEMPO.accountKeychain as Address, data: revoke }], sponsored: true, nonce: { kind: "expiring" }, nowSec: Math.floor(Date.now() / 1000) });
    expect(rev.receipt.status).toBe("success");
    const feePayer = (rev.receipt as { feePayer?: string }).feePayer?.toLowerCase();
    expect(feePayer).not.toBe(root.address.toLowerCase());

    const after = foldKeychain(await scanKeychain(client as never, root.address, start, await client.getBlockNumber()));
    const [revoked] = await readKeyStates(client as never, root.address, after);
    expect(keyStatus(revoked!, BigInt(nowSec))).toBe("revoked");
    console.log(JSON.stringify({ root: root.address, keyId, authorizeTx: auth.hash, revokeTx: rev.hash, revokeFeePayer: feePayer, scannedBlocks: `${start}..${head}` }));
  }, 120_000);
});
