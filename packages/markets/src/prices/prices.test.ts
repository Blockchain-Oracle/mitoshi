import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashTypedData, recoverTypedDataAddress, decodeAbiParameters, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { attestedPrintProof, PRINT_TYPES, ATTESTED_DOMAIN_NAME } from "./attested";
import { dataStreamsAuthHeaders, v11Summary } from "./datastreams";
import { feedAt, feedIdToAscii, latestMedian, redstoneFeedBytes } from "./redstone";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "..", "contracts", "test", "fixtures", "prints");
const SIGNERS = new Set(["0xdeb22f54738d54976c4c0fe5ce6d408e40d88499", "0xdd682daec5a90dd295d14da4b0bec9281017b5be", "0x51ce04be4b3e32572c4ec9135221d0691ba7d202"]);

describe("redstone relay parsing", () => {
  const pkg = (signer: string, tMs: number, value: string) => `{"timestampMilliseconds":${tMs},"signature":"AA==","signerAddress":"${signer}","dataPoints":[{"dataFeedId":"TSLA","value":${value}}]}`;
  const text = `{"BTC":[],"TSLA":[${[
    pkg("0xdEB22f54738d54976C4c0fe5ce6d408E40d88499", 1_000_000, "358.18500933"),
    pkg("0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE", 1_000_000, "358.2"),
    pkg("0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202", 1_000_000, "358.1"),
    pkg("0x0000000000000000000000000000000000000bad", 1_000_000, "1"),
    pkg("0xdEB22f54738d54976C4c0fe5ce6d408E40d88499", 990_000, "300"),
  ].join(",")}],"ETH":[]}`;

  it("cuts one feed at exactly T from configured signers, median from source text (no floats)", () => {
    const at = feedAt(text, "TSLA", 1_000, SIGNERS)!;
    expect(at.packages).toHaveLength(3);
    expect(at.medianE8).toBe(35_818_500_933n);
    expect(feedAt(text, "NVDA", 1_000, SIGNERS)).toBeNull();
  });

  it("latestMedian takes the newest timestamp only", () => {
    expect(latestMedian(text, "TSLA", SIGNERS)).toEqual({ priceE8: 35_818_500_933n, publishTimeSec: 1_000, signers: 3 });
  });

  it("round-trips an ASCII feed id", () => {
    const hex = `0x${Buffer.from(redstoneFeedBytes("TSLA---24_7")).toString("hex")}`;
    expect(feedIdToAscii(hex)).toBe("TSLA---24_7");
  });
});

describe("attested proofs", () => {
  it("sign the verifier's EIP-712 Print struct bound to the engine", async () => {
    const attestor = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const engine = "0x113Ca86bE942671E5290Ed57d86297F0Ecd61b6a";
    const input = { engine, chainId: 42431, marketId: `0x${"11".repeat(32)}` as Hex, which: 0, tSec: 1_800_000_000, feedId: `0x${"22".repeat(32)}` as Hex, barLenSec: 60, priceE8: 12_345n, fetchedAtSec: 1_800_000_010 } as const;
    const proof = await attestedPrintProof(attestor, input);
    const [price, expo, barStart, fetchedAt, sig] = decodeAbiParameters([{ type: "int64" }, { type: "int8" }, { type: "uint40" }, { type: "uint40" }, { type: "bytes" }], proof);
    expect([price, expo, barStart, fetchedAt]).toEqual([12_345n, -8, 1_800_000_000 - 60, 1_800_000_010]);
    const message = { marketId: input.marketId, which: 0, t: input.tSec, price: 12_345n, expo: -8, feedId: input.feedId, barStart: input.tSec - 60, barLen: 60, fetchedAt: input.fetchedAtSec };
    const domain = { name: ATTESTED_DOMAIN_NAME, version: "1", chainId: 42431, verifyingContract: engine } as const;
    expect(await recoverTypedDataAddress({ domain, types: PRINT_TYPES, primaryType: "Print", message, signature: sig })).toBe(attestor.address);
    expect(hashTypedData({ domain, types: PRINT_TYPES, primaryType: "Print", message })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("data streams", () => {
  it("signs METHOD FULL_PATH BODY_HASH API_KEY TIMESTAMP with HMAC-SHA256 (docs vector shape)", () => {
    const h = dataStreamsAuthHeaders("GET", "/api/v1/reports?feedID=0xabc&timestamp=1", "key", "secret", 1_716_211_845_123);
    expect(h.Authorization).toBe("key");
    expect(h["X-Authorization-Timestamp"]).toBe("1716211845123");
    // Independently: sha256("") = e3b0…b855.
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const expected = createHmac("sha256", "secret").update("GET /api/v1/reports?feedID=0xabc&timestamp=1 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 key 1716211845123").digest("hex");
    expect(h["X-Authorization-Signature-SHA256"]).toBe(expected);
  });

  it("reads the real SPY v11 report: mid 763.025, marketStatus 2 (Regular)", () => {
    const hex = `0x${readFileSync(join(FIXTURES, "datastreams-spy-v11-1788976800.hex"), "utf8").trim().replace(/^0x/, "")}` as Hex;
    expect(v11Summary(hex)).toEqual({ midE18: 763_025_000_000_000_000_000n, marketStatus: 2, observationsSec: 1_788_976_800 });
  });
});
