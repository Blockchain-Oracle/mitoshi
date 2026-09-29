import { describe, expect, it } from "vitest";
import { BaseError, encodeErrorResult, HttpRequestError, TimeoutError } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { diagnoseWrite, isAmbiguousSend } from "./diagnose-write";

describe("write-path diagnosis", () => {
  it("names engine refusals carried as bare revert data (a relay fill or a sync send)", () => {
    const data = encodeErrorResult({ abi: eventsEngineAbi, errorName: "ImmediateOrCancelNoFill" });
    expect(diagnoseWrite(new BaseError("execution reverted", { details: `execution reverted, data: "${data}"` }))).toMatchObject({ kind: "requote", errorName: "ImmediateOrCancelNoFill" });
    const blocked = encodeErrorResult({ abi: eventsEngineAbi, errorName: "ReceivePolicyBlocked" });
    expect(diagnoseWrite(new BaseError("execution reverted", { details: `data: "${blocked}"` }))).toMatchObject({ kind: "receive-policy" });
  });

  it("treats a timeout or a transport failure on the raw send as unknown (never re-sent), not a fill failure", () => {
    const send502 = new HttpRequestError({ url: "https://rpc.moderato.tempo.xyz", status: 502, body: { method: "eth_sendRawTransactionSync", params: ["0x76"] } });
    const fill502 = new HttpRequestError({ url: "https://rpc.moderato.tempo.xyz", status: 502, body: { method: "eth_fillTransaction", params: [] } });
    expect(isAmbiguousSend(new BaseError("wrapped", { cause: send502 }))).toBe(true);
    expect(isAmbiguousSend(fill502)).toBe(false);
    expect(isAmbiguousSend(new TimeoutError({ body: {}, url: "x" }))).toBe(true);
    expect(isAmbiguousSend(new Error("Sponsorship rejected."))).toBe(false);
  });
});
