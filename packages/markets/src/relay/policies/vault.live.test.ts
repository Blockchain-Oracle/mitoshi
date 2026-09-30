/**
 * The vault's async sender rule against Moderato itself: grant #1 on the deployed EventVault (the S7.5 live drive's
 * session grant, revoked) is refused for its own actor and for a foreigner — the relay's chain reader answers, not a
 * table. `pnpm --filter @cwf/markets test:live`.
 */
import { describe, expect, it } from "vitest";
import { createPublicClient, encodeFunctionData, http, maxUint256, type Address } from "viem";
import { tempoModerato } from "viem/chains";
import { TEMPO } from "@cwf/clients";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { OPEN_POSTURE } from "@cwf/core";
import { evaluate } from "../engine";
import type { RelayReader } from "../types";
import { vaultPolicy } from "./vault";

const reader = createPublicClient({ chain: tempoModerato, transport: http(process.env.TEMPO_RPC_HTTP_URL ?? "https://rpc.moderato.tempo.xyz") }) as unknown as RelayReader;
const VAULT = vaultPolicy.targets[0]!;
const ACTOR_OF_GRANT_1 = "0x8Ae1C05a4038bad04d17B763A15BfD791F524D0a" as Address;
const FOREIGN = "0x00000000000000000000000000000000000000b2" as Address;
const MARKET = "0x42bd67a68cdb00c58657eb826592605acc9787a014ce132c85e08e8c1b7ea56c" as const;
const ctx = { method: "eth_fillTransaction", device: null, region: OPEN_POSTURE, nowSec: Math.floor(Date.now() / 1000) };
const tap = { to: VAULT, data: encodeFunctionData({ abi: eventVaultAbi, functionName: "placeFor", args: [1n, MARKET, 0, true, 520_000n, 1_000_000n, 1n << 62n] }), value: 0n };
const req = (from: Address) => ({ chainId: 42431, from, calls: [tap], gas: 3_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD as Address, nonceKey: maxUint256, validBefore: ctx.nowSec + 20, keyAuthorization: null });
const config = { chainId: 42431, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: [vaultPolicy], reader };

describe("vault async sender rule on Moderato", () => {
  it("refuses grant #1's own actor now that it is revoked, and a foreign sender", async () => {
    expect(await evaluate(config, req(ACTOR_OF_GRANT_1), ctx)).toMatchObject({ ok: false, code: "sender" });
    expect(await evaluate(config, req(FOREIGN), ctx)).toMatchObject({ ok: false, code: "sender" });
  });
});
