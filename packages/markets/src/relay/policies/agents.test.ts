import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, type Address } from "viem";
import { OPEN_POSTURE } from "@cwf/core";
import { ERC8004, TEMPO } from "@cwf/clients";
import { identityRegistryAbi } from "../../agents/erc8004-abi";
import { encodeIntent } from "../../submitter/encoders";
import { evaluate } from "../engine";
import { POLICIES } from "./index";

const ctx = { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000 };
const config = { chainId: 42431, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const req = (calls: { to: Address; data: `0x${string}` }[], gas = 2_000_000n) => ({ chainId: 42431, from: "0x00000000000000000000000000000000000000a1" as Address, calls: calls.map((c) => ({ ...c, value: 0n })), gas, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });

describe("agents relay policy (D-218.7)", () => {
  it("sponsors registering an agent and pointing it at its file, as the encoder sends them", async () => {
    const enc = await encodeIntent({ kind: "agent-register", agentURI: "data:application/json;base64,e30=" }, { chainId: 42431, wallet: "0x00000000000000000000000000000000000000a1" });
    if (!enc.ok) throw new Error(enc.diagnosis.technical);
    expect(enc.value).toMatchObject({ area: "agents", sponsored: true });
    expect(enc.value.calls[0]!.to).toBe(ERC8004[42431].identity);
    expect(await evaluate(config, req(enc.value.calls), ctx)).toMatchObject({ ok: true, area: "agents" });
    const set = await encodeIntent({ kind: "agent-set-uri", agentId: 7n, agentURI: "https://testnet.mitoshi.xyz/api/agents/1/registration.json" }, { chainId: 42431, wallet: "0x00000000000000000000000000000000000000a1" });
    if (!set.ok) throw new Error(set.diagnosis.technical);
    expect(await evaluate(config, req(set.value.calls, 200_000n), ctx)).toMatchObject({ ok: true });
  });

  it("sponsors nothing else on the identity registry, and nothing over its gas cap", async () => {
    const meta = { to: ERC8004[42431].identity as Address, data: encodeFunctionData({ abi: identityRegistryAbi, functionName: "setMetadata", args: [7n, "k", "0x"] }) };
    expect(await evaluate(config, req([meta]), ctx)).toMatchObject({ ok: false, code: "selector" });
    const big = { to: ERC8004[42431].identity as Address, data: encodeFunctionData({ abi: identityRegistryAbi, functionName: "register", args: ["data:,x"] }) };
    expect(await evaluate(config, req([big], 3_000_001n), ctx)).toMatchObject({ ok: false, code: "gas" });
  });
});
