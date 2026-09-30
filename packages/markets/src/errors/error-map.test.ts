import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, HttpRequestError, TimeoutError, UserRejectedRequestError, parseAbi, encodeErrorResult } from "viem";
import { diagnose } from "./error-map";

const abi = parseAbi(["error SpendingLimitExceeded()", "error CallNotAllowed()", "error PolicyForbids()", "error Mystery(uint256 x)"]);
const revert = (errorName: "SpendingLimitExceeded" | "CallNotAllowed" | "PolicyForbids" | "Mystery") =>
  new BaseError("execution reverted", {
    cause: new ContractFunctionRevertedError({
      abi,
      functionName: "placeOrder",
      data: errorName === "Mystery" ? encodeErrorResult({ abi, errorName, args: [1n] }) : encodeErrorResult({ abi, errorName }),
    }),
  });

describe("diagnose", () => {
  it("maps Tempo access-key and policy reverts into the one vocabulary (M-13)", () => {
    expect(diagnose(revert("SpendingLimitExceeded"))).toMatchObject({ kind: "spending-limit", errorName: "SpendingLimitExceeded" });
    expect(diagnose(revert("CallNotAllowed")).kind).toBe("call-not-allowed");
    expect(diagnose(revert("PolicyForbids")).kind).toBe("receive-policy");
    expect(diagnose(revert("Mystery"))).toMatchObject({ kind: "contract-revert", errorName: "Mystery" });
  });

  it("recognises a user rejection anywhere in the cause chain, and relay refusals by message", () => {
    expect(diagnose(new BaseError("wrapped", { cause: new UserRejectedRequestError(new Error("no")) })).kind).toBe("user-rejected");
    expect(diagnose(new Error("Sponsorship rejected.")).kind).toBe("sponsor-refused");
    expect(diagnose(new Error("something odd"))).toMatchObject({ kind: "unknown", retryable: true });
  });

  it("recognises viem transport failures by their declared names (no instanceof, so no viem in first load)", () => {
    const http = new HttpRequestError({ url: "https://rpc.moderato.tempo.xyz", status: 503, details: "Service Unavailable" });
    expect(diagnose(new BaseError("wrapped", { cause: http })).kind).toBe("rpc-down");
    expect(diagnose(new TimeoutError({ body: {}, url: "https://rpc.moderato.tempo.xyz" })).kind).toBe("rpc-down");
  });
});

describe("diagnose — node refusals carried in viem's details (X20)", () => {
  it("names a revoked key and an exceeded limit from the RPC error's details, not its generic short message", () => {
    const rpc = (details: string) => new BaseError("An internal error was received.", { details });
    expect(diagnose(rpc("Revm error: keychain validation failed: AccountKeychainError(KeyAlreadyRevoked(KeyAlreadyRevoked))")).kind).toBe("key-revoked");
    expect(diagnose(rpc("Execution reverted with reason: Account keychain error: SpendingLimitExceeded(SpendingLimitExceeded).")).kind).toBe("spending-limit");
    expect(diagnose(rpc("Execution reverted with reason: Account keychain error: CallNotAllowed(CallNotAllowed).")).kind).toBe("call-not-allowed");
  });
});

describe("diagnose — the public RPC's per-IP limit (S7 gate)", () => {
  it("names a refused raw send as rate-limited (nothing sent, retry shortly), not as an unknown failure", () => {
    const rpc = (details: string) => new BaseError("An error occurred.", { details });
    expect(diagnose(rpc("Request exceeds defined limit.")).kind).toBe("rate-limited");
    expect(diagnose(rpc("rate limited, try again in 118ms")).kind).toBe("rate-limited");
    expect(diagnose(rpc("Request exceeds defined limit.")).retryable).toBe(true);
  });
});
