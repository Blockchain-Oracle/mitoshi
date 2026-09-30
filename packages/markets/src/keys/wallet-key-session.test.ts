import { KeyAuthorization } from "ox/tempo";
import { generatePrivateKey } from "viem/accounts";
import { Account } from "viem/tempo";
import { describe, expect, it } from "vitest";
import { newWalletKey, walletKeySession } from "./wallet-key-session";
import { walletKeyAuthorization } from "./wallet-key";

const ENGINE = "0x1111111111111111111111111111111111111111" as const;
const PATH_USD = "0x20c0000000000000000000000000000000000000" as const;

describe("wallet-key session (D-141)", () => {
  it("signs with our non-extractable key and publishes the root's authorization, in the SDK's RPC shape, with the first send", async () => {
    const root = Account.fromSecp256k1(generatePrivateKey());
    const record = await newWalletKey(root.address);
    const terms = walletKeyAuthorization({ engine: ENGINE, pathUsd: PATH_USD, nowSec: 1_800_000_000 });
    // What `wallet_authorizeAccessKey` hands back: the signed authorization, RPC-encoded.
    const signed = await root.signKeyAuthorization({ accessKeyAddress: record.address, keyType: "p256" } as never, { ...terms, chainId: 42431 } as never);
    const rpc = KeyAuthorization.toRpc(signed as never);
    const session = walletKeySession({ record, root: root.address, network: "testnet", rpcHttpUrls: ["https://rpc.moderato.tempo.xyz"], relayUrl: "http://localhost/api/relay", authorizationRpc: rpc, nowSec: () => 1_800_000_000 });
    expect(session.authority).toBe("access-key");
    expect(session.address.toLowerCase()).toBe(root.address.toLowerCase());
    expect(KeyAuthorization.fromRpc(rpc).address.toLowerCase()).toBe(record.address.toLowerCase());
    session.dispose();
  });
});
