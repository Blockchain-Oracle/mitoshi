// The phone app's passkey origin and association files (D-227, MOBILE): the origin must match what Android's
// Credential Manager writes into clientDataJSON byte for byte, or every Android passkey ceremony is refused.
import { describe, expect, it } from "vitest";
import { ANDROID_PACKAGE, ANDROID_PASSKEY_ORIGINS, apkKeyHashOrigin, appleAppSiteAssociation, assetLinks } from "./app-links";

describe("apkKeyHashOrigin", () => {
  it("is base64url of the certificate's SHA-256, unpadded", () => {
    // Expected value from Node: Buffer.from(hex, "hex").toString("base64url").
    expect(apkKeyHashOrigin("A1:FF:55:DC:A0:81:24:6A:BA:34:F0:09:25:28:53:59:3B:6C:1F:49:F5:73:AA:E9:0C:E8:6B:E6:D4:E9:E0:63")).toBe(
      "android:apk-key-hash:of9V3KCBJGq6NPAJJShTWTtsH0n1c6rpDOhr5tTp4GM",
    );
  });

  it("uses the URL-safe alphabet", () => {
    // 0xFB 0xFF … encodes to "-" and "_" in base64url ("+" and "/" in base64).
    const origin = apkKeyHashOrigin(`FB:FF:${"FB:FF:".repeat(14)}FB:FF`);
    expect(origin).toMatch(/^android:apk-key-hash:[A-Za-z0-9_-]{43}$/);
    expect(origin).toContain("-");
    expect(origin).toContain("_");
  });

  it("refuses anything that isn't a SHA-256 fingerprint", () => {
    expect(() => apkKeyHashOrigin("5D:6E:98:AF")).toThrow();
  });
});

describe("association files", () => {
  it("lists one origin per signing certificate", () => {
    expect(ANDROID_PASSKEY_ORIGINS.length).toBe(assetLinks()[0]!.target.sha256_cert_fingerprints.length);
  });

  it("grants App Links and sign-in credentials to the app", () => {
    const [statement] = assetLinks();
    expect(statement!.relation).toEqual(["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"]);
    expect(statement!.target.package_name).toBe(ANDROID_PACKAGE);
  });

  it("associates the same app for links and passkeys, and keeps the API out of universal links", () => {
    const aasa = appleAppSiteAssociation();
    expect(aasa.webcredentials.apps).toEqual(aasa.applinks.details[0]!.appIDs);
    expect(aasa.applinks.details[0]!.components[0]).toEqual({ "/": "/api/*", exclude: true });
  });
});
