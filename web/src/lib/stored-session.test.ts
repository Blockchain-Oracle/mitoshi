import { describe, expect, it } from "vitest";
import { hasStoredConnection } from "./stored-session";

describe("hasStoredConnection", () => {
  it("is a session only while wagmi names a current connection", () => {
    expect(hasStoredConnection('wagmi.recentConnectorId="webAuthn"; wagmi.store={"state":{"chainId":42431,"current":"u1"},"version":2}')).toBe(true);
    expect(hasStoredConnection(`wagmi.store=${encodeURIComponent('{"state":{"current":"u1"}}')}`)).toBe(true);
  });
  it("is no session after a sign-out, even with the last-used connector kept", () => {
    expect(hasStoredConnection('wagmi.recentConnectorId="webAuthn"; wagmi.store={"state":{"chainId":42431,"current":null},"version":2}')).toBe(false);
    expect(hasStoredConnection("")).toBe(false);
  });
});
