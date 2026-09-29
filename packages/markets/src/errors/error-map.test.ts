import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, parseAbi, encodeErrorResult } from "viem";
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
});
