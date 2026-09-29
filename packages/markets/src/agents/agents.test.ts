import { decodeFunctionData, getAddress, toFunctionSignature, type AbiEvent, type AbiFunction } from "viem";
import { describe, expect, it } from "vitest";
import upstream from "./erc8004.upstream.json";
import receipts from "./moderato.receipts.json";
import { identityRegistryAbi, reputationRegistryAbi } from "./erc8004-abi";
import { agentRegistryId, erc8004Registries, giveFeedbackCall, readNewFeedback, readRegistered, registerAgentCall, setAgentUriCall } from "./erc8004";
import { buildAgentRegistration, registrationUrl } from "./registration";

const sig = (e: AbiFunction | AbiEvent) => `${e.type} ${toFunctionSignature(e as AbiFunction)}`;

describe("ERC-8004 ABI", () => {
  it("every function and event we call exists, with that exact signature, in the pinned upstream ABIs", () => {
    for (const e of identityRegistryAbi) expect(upstream.identity).toContain(sig(e as AbiFunction));
    for (const e of reputationRegistryAbi) expect(upstream.reputation).toContain(sig(e as AbiFunction));
  });
});

describe("registries", () => {
  it("uses the Moderato vanity set on 42431 and the mainnet set on 4217, and nothing else", () => {
    expect(erc8004Registries(42431).identity).toBe(getAddress("0x8004A818BFB912233c491871b3d84c89A494BD9e"));
    expect(erc8004Registries(4217).reputation).toBe(getAddress("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"));
    expect(() => erc8004Registries(1)).toThrow(/not pinned/);
    expect(agentRegistryId(42431)).toBe("eip155:42431:0x8004A818BFB912233c491871b3d84c89A494BD9e");
  });
});

describe("calls", () => {
  it("encodes register / setAgentURI / giveFeedback against the right registry", () => {
    const reg = registerAgentCall(42431, "https://testnet.mitoshi.xyz/api/agents/a/registration.json");
    expect(reg.to).toBe(erc8004Registries(42431).identity);
    expect(decodeFunctionData({ abi: identityRegistryAbi, data: reg.data })).toMatchObject({ functionName: "register", args: ["https://testnet.mitoshi.xyz/api/agents/a/registration.json"] });
    expect(decodeFunctionData({ abi: identityRegistryAbi, data: setAgentUriCall(42431, 6n, "ipfs://x").data }).args).toEqual([6n, "ipfs://x"]);
    const fb = giveFeedbackCall(42431, { agentId: 6n, value: -250n, valueDecimals: 2, tag1: "pnl" });
    expect(fb.to).toBe(erc8004Registries(42431).reputation);
    expect(decodeFunctionData({ abi: reputationRegistryAbi, data: fb.data }).args.slice(0, 5)).toEqual([6n, -250n, 2, "pnl", ""]);
  });
  it("refuses a URI scheme the spec does not name, and out-of-range feedback", () => {
    expect(() => registerAgentCall(42431, "http://insecure")).toThrow(/agentURI/);
    expect(() => giveFeedbackCall(42431, { agentId: 1n, value: 1n, valueDecimals: 19 })).toThrow(/0–18/);
    expect(() => giveFeedbackCall(42431, { agentId: 1n, value: 2n ** 127n, valueDecimals: 0 })).toThrow(/int128/);
  });
});

describe("receipts (real Moderato txs)", () => {
  it("reads agent id 6 from the register receipt and feedback index 1 from the rater's", () => {
    expect(readRegistered(42431, receipts.register.logs as never)).toMatchObject({ agentId: 6n, owner: getAddress("0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e") });
    expect(readNewFeedback(42431, receipts.giveFeedback.logs as never)).toEqual({ agentId: 6n, client: getAddress("0x6Ed3a4b6E42B2C45211074F8D7BA58dbB2FAad0C"), feedbackIndex: 1n });
    expect(readRegistered(4217, receipts.register.logs as never)).toBeNull();
  });
});

describe("registration file", () => {
  it("has the registration-v1 shape with the on-chain registration", () => {
    const file = buildAgentRegistration({ strategyId: "s", name: "n", description: "d", image: "https://x/i.svg", origin: "https://testnet.mitoshi.xyz/", active: true, registrations: [{ chainId: 42431, agentId: 6n }] });
    expect(file).toMatchObject({ type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", x402Support: false, registrations: [{ agentId: 6, agentRegistry: "eip155:42431:0x8004A818BFB912233c491871b3d84c89A494BD9e" }], supportedTrust: ["reputation"] });
    expect(registrationUrl("https://testnet.mitoshi.xyz/", "a b")).toBe("https://testnet.mitoshi.xyz/api/agents/a%20b/registration.json");
    expect(() => buildAgentRegistration({ strategyId: "s", name: "n", description: "d", image: "", origin: "http://evil", active: true, registrations: [] })).toThrow(/https/);
  });
});
