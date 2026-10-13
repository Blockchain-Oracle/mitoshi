// Round 7: the passkey failures a person can act on are named; a cancel stays quiet (not classified).
import { describe, expect, it } from "vitest";
import { passkeyFailure } from "./passkey-errors";

const dom = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("passkeyFailure", () => {
  it("names the actionable WebAuthn failures, through wrappers", () => {
    expect(passkeyFailure(dom("InvalidStateError", "The authenticator was previously registered"))).toBe("exists");
    expect(passkeyFailure(new Error("register failed", { cause: dom("NotSupportedError") }))).toBe("unsupported");
    expect(passkeyFailure(dom("SecurityError", "The RP ID is invalid for this domain"))).toBe("blocked");
  });
  it("leaves a cancel and a network error to the generic path", () => {
    expect(passkeyFailure(dom("NotAllowedError", "The operation either timed out or was not allowed"))).toBeNull();
    expect(passkeyFailure(new Error("fetch failed"))).toBeNull();
  });
});
