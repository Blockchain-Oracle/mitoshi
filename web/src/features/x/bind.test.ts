// The bind signature (S11 gate, D-227): a passkey signs the exact link text — the same WebAuthn P-256 envelope a real
// passkey makes (`newPasskeyRoot`, headless) — and the server's verifier (Tempo's rules, the one `/api/x/bind` uses)
// accepts it for that account only, for that X user, network and moment.
import { createPublicClient, http, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { verifySignedMessage, xLinkMessage, xSignatureFresh, xUnlinkMessage } from "@cwf/core";
import { tempoChain } from "@cwf/markets";
import { newPasskeyRoot } from "@cwf/markets/drive";
import { messageVerifier } from "@cwf/markets/server";

const client = createPublicClient({ chain: tempoChain("testnet"), transport: http("https://rpc.moderato.tempo.xyz") }) as PublicClient;
const verify = messageVerifier(client, { allowAccessKey: true });
const NOW = 1_791_870_000_000;

describe("X bind: a passkey signature over the link text", () => {
  it("verifies for the signing account and nothing else", async () => {
    const root = newPasskeyRoot();
    const other = newPasskeyRoot();
    const fields = { network: "testnet" as const, authorId: "1234567890", account: root.address, issuedAtMs: NOW };
    const text = xLinkMessage(fields);
    const signature = await root.account.signMessage({ message: text });
    expect(await verifySignedMessage({ text, signature, signer: root.address }, verify)).toBe(true);
    expect(await verifySignedMessage({ text, signature, signer: other.address }, verify)).toBe(false);
    expect(await verifySignedMessage({ text: xLinkMessage({ ...fields, authorId: "999" }), signature, signer: root.address }, verify)).toBe(false);
    expect(await verifySignedMessage({ text: xLinkMessage({ ...fields, network: "mainnet" }), signature, signer: root.address }, verify)).toBe(false);
    expect(await verifySignedMessage({ text: xUnlinkMessage(fields), signature, signer: root.address }, verify)).toBe(false);
  }, 30_000);

  it("accepts a signature five minutes either side and no more", () => {
    expect(xSignatureFresh(NOW - 5 * 60_000, NOW)).toBe(true);
    expect(xSignatureFresh(NOW - 5 * 60_000 - 1, NOW)).toBe(false);
    expect(xSignatureFresh(NOW + 5 * 60_000 + 1, NOW)).toBe(false);
  });
});
