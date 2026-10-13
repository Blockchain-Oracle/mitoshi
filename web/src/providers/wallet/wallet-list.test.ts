import { describe, expect, it } from "vitest";
import { badgeOf, realInjected, recentConnectorId } from "./wallet-list";

const c = (id: string, name: string, icon?: string) => ({ id, name, type: "injected", icon });

describe("the sign-in's wallet list", () => {
  it("drops our own announcements and the SDK's blank provider", () => {
    const list = [
      c("io.metamask", "MetaMask", "data:image/svg+xml;base64,AAA"),
      c("com.injectedwallet", "Injected Wallet"),
      c("xyz.mitoshi.passkey", "Passkey"),
      c("xyz.tempo", "Tempo Wallet"),
      c("app.unknown", "Some Wallet", 'data:image/svg+xml,<svg><rect width="1" height="1" fill="black"/></svg>'),
      c("injected", "Injected"),
    ];
    expect(realInjected(list, true).map((x) => x.id)).toEqual(["io.metamask"]);
  });
  it("keeps the generic injected connector only when a provider is there and none announced", () => {
    expect(realInjected([c("injected", "Injected")], true).map((x) => x.id)).toEqual(["injected"]);
    expect(realInjected([c("injected", "Injected")], false)).toEqual([]);
  });
  it("puts Last used over Detected", () => {
    const detected = new Set(["io.metamask"]);
    expect(badgeOf({ id: "io.metamask" }, "io.metamask", detected)).toBe("lastUsed");
    expect(badgeOf({ id: "io.metamask" }, "xyz.tempo", detected)).toBe("detected");
    expect(badgeOf({ id: "walletConnect" }, null, detected)).toBeNull();
  });
  it("reads wagmi's last-used connector from the cookie", () => {
    expect(recentConnectorId('a=1; wagmi.recentConnectorId="io.metamask"; b=2')).toBe("io.metamask");
    expect(recentConnectorId(`wagmi.recentConnectorId=${encodeURIComponent('"xyz.tempo"')}`)).toBe("xyz.tempo");
    expect(recentConnectorId("a=1")).toBeNull();
  });
});
