import { describe, expect, it } from "vitest";
import { readMemoryMessage, sealMemoryMessage } from "./memory";

const seal = { network: "testnet" as const, strategyId: "3", creator: "0xAbCd000000000000000000000000000000000001", issuedAtMs: 1_760_000_000_000, title: "What it learned", readPriceBase: 250_000n, body: "Fades the open\nwhen the print is late." };
const read = { network: "testnet" as const, strategyId: "3", reader: "0xAbCd000000000000000000000000000000000002", issuedAtMs: 1_760_000_000_000 };

describe("the Memory Market's signed texts", () => {
  it("bind every field of a seal, the body included, so a signature opens nothing else", () => {
    const base = sealMemoryMessage(seal);
    expect(base).toContain(seal.body);
    for (const change of [{ network: "mainnet" as const }, { strategyId: "4" }, { creator: "0xabcd000000000000000000000000000000000009" }, { issuedAtMs: seal.issuedAtMs + 1 }, { title: "Other" }, { readPriceBase: 0n }, { readPriceBase: 250_001n }, { body: "Fades the open." }]) {
      expect(sealMemoryMessage({ ...seal, ...change })).not.toBe(base);
    }
  });

  it("bind every field of a read, and a seal text is never a read text", () => {
    const base = readMemoryMessage(read);
    for (const change of [{ network: "mainnet" as const }, { strategyId: "4" }, { reader: seal.creator }, { issuedAtMs: read.issuedAtMs + 1 }]) {
      expect(readMemoryMessage({ ...read, ...change })).not.toBe(base);
    }
    expect(readMemoryMessage({ ...read, reader: seal.creator })).not.toBe(sealMemoryMessage(seal));
  });

  it("say in words what a paid read costs, or that there are none", () => {
    expect(sealMemoryMessage(seal)).toContain("Paid reads: 0.25 pathUSD each, paid to the creator over MPP");
    expect(sealMemoryMessage({ ...seal, readPriceBase: 0n })).toContain("Paid reads: off (copiers only)");
  });

  it("name addresses lowercased, so the browser and the route build the same bytes whatever the checksum", () => {
    expect(readMemoryMessage({ ...read, reader: read.reader.toUpperCase().replace("0X", "0x") })).toBe(readMemoryMessage(read));
    expect(sealMemoryMessage({ ...seal, creator: seal.creator.toLowerCase() })).toBe(sealMemoryMessage(seal));
  });
});
