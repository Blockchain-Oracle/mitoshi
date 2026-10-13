// /download's store links (D-230): only Apple's and Google's own test pages are offered, a malformed value reads as
// unset (the card says "Coming to …"), and the open test wins over the internal one.
import { describe, expect, it } from "vitest";
import { orderCards, parsePlay, parseTestflight, platformOf, readStoreRelease, storeOpen, testflightClosed, type StoreRelease } from "./release";

const TF = "https://testflight.apple.com/join/AbC123xy";
const OPEN = "https://play.google.com/apps/testing/xyz.mitoshi.app.testnet";
const INTERNAL = "https://play.google.com/apps/internaltest/4701234567890123456";

describe("parseTestflight", () => {
  it("takes Apple's public join link", () => {
    expect(parseTestflight(` ${TF} `)).toBe(TF);
  });
  it("refuses anything else", () => {
    for (const bad of [undefined, "", "not a url", "http://testflight.apple.com/join/AbC123xy", "https://testflight.apple.com/v1/app/123", "https://evil.example/join/AbC123xy", "https://testflight.apple.com.evil.example/join/x"]) {
      expect(parseTestflight(bad)).toBeNull();
    }
  });
});

describe("parsePlay", () => {
  it("takes the open test's opt-in page or the store page, and the internal test's invitation", () => {
    expect(parsePlay(OPEN, "open")).toBe(OPEN);
    expect(parsePlay("https://play.google.com/store/apps/details?id=xyz.mitoshi.app.testnet", "open")).toBe("https://play.google.com/store/apps/details?id=xyz.mitoshi.app.testnet");
    expect(parsePlay(INTERNAL, "internal")).toBe(INTERNAL);
  });
  it("refuses another host, a track's wrong page, or a broken package", () => {
    expect(parsePlay(INTERNAL, "open")).toBeNull();
    expect(parsePlay(OPEN, "internal")).toBeNull();
    expect(parsePlay("https://play.google.com.evil.example/apps/testing/xyz.mitoshi.app", "open")).toBeNull();
    expect(parsePlay("https://play.google.com/apps/testing/notapackage", "open")).toBeNull();
    expect(parsePlay("https://play.google.com/store/apps/details", "open")).toBeNull();
  });
});

describe("testflightClosed", () => {
  it("reads Apple's closed page, escaped as it is served, and the full one", () => {
    expect(testflightClosed('<div class="beta-status"> This beta isn&#39;t accepting any new testers right now. </div>')).toBe(true);
    expect(testflightClosed("This beta isn’t accepting any new testers right now.")).toBe(true);
    expect(testflightClosed("<h1>This beta is full.</h1>")).toBe(true);
  });
  it("takes a join page as open", () => {
    expect(testflightClosed("<h1>Join the Mitoshi beta</h1><a>Start Testing</a>")).toBe(false);
  });
});

describe("readStoreRelease", () => {
  it("is all pending with nothing set", () => {
    expect(readStoreRelease({})).toEqual({ testflight: null, play: null });
  });
  it("prefers the open test and falls back to the internal one", () => {
    expect(readStoreRelease({ TESTFLIGHT_PUBLIC_LINK: TF, PLAY_OPEN_TEST_LINK: OPEN, PLAY_INTERNAL_TEST_LINK: INTERNAL })).toEqual({ testflight: TF, play: { url: OPEN, track: "open" } });
    expect(readStoreRelease({ PLAY_INTERNAL_TEST_LINK: INTERNAL })).toEqual({ testflight: null, play: { url: INTERNAL, track: "internal" } });
    expect(readStoreRelease({ PLAY_OPEN_TEST_LINK: "garbage", PLAY_INTERNAL_TEST_LINK: INTERNAL }).play).toEqual({ url: INTERNAL, track: "internal" });
  });
});

describe("platformOf", () => {
  it("reads the phone and the app's own web view", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ platform: "ios", inApp: false });
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")).toEqual({ platform: "android", inApp: false });
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 CWFShell/1.0.0 (android; testnet)")).toEqual({ platform: "android", inApp: true });
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")).toEqual({ platform: "desktop", inApp: false });
    expect(platformOf(null)).toEqual({ platform: "desktop", inApp: false });
  });
});

describe("storeOpen", () => {
  it("counts TestFlight's public link and Play's open test, never Play's invitation", () => {
    expect(storeOpen({ testflight: TF, play: null }, "ios")).toBe(true);
    expect(storeOpen({ testflight: null, play: { url: OPEN, track: "open" } }, "android")).toBe(true);
    expect(storeOpen({ testflight: null, play: { url: INTERNAL, track: "internal" } }, "android")).toBe(false);
    expect(storeOpen({ testflight: null, play: null }, "ios")).toBe(false);
  });
});

describe("orderCards", () => {
  const none: StoreRelease = { testflight: null, play: null };
  const both: StoreRelease = { testflight: TF, play: { url: OPEN, track: "open" } };
  const invited: StoreRelease = { testflight: null, play: { url: INTERNAL, track: "internal" } };
  it("shows a desktop the open store tests first, then the web app, then the stores still coming", () => {
    expect(orderCards("desktop", false, both)).toEqual(["ios", "android", "web"]);
    expect(orderCards("desktop", false, none)).toEqual(["web", "ios", "android"]);
    expect(orderCards("desktop", false, { testflight: null, play: { url: OPEN, track: "open" } })).toEqual(["android", "web", "ios"]);
  });
  it("leads a phone with its own app when its test is open, else with the web app", () => {
    expect(orderCards("ios", false, both)).toEqual(["ios", "web", "android"]);
    expect(orderCards("ios", false, none)).toEqual(["web", "ios", "android"]);
    expect(orderCards("android", false, both)).toEqual(["android", "web", "ios"]);
    expect(orderCards("android", false, { testflight: TF, play: null })).toEqual(["web", "android", "ios"]);
  });
  it("never leads with Play's invitation: the web app leads an Android phone, and a desk puts it after the web app", () => {
    expect(orderCards("android", false, invited)).toEqual(["web", "android", "ios"]);
    expect(orderCards("ios", false, invited)).toEqual(["web", "ios", "android"]);
    expect(orderCards("desktop", false, invited)).toEqual(["web", "android", "ios"]);
    expect(orderCards("desktop", false, { ...invited, testflight: TF })).toEqual(["ios", "web", "android"]);
    expect(orderCards("ios", false, { ...invited, testflight: TF })).toEqual(["ios", "web", "android"]);
  });
  it("leads with the app itself inside its own web view", () => {
    expect(orderCards("android", true, none)).toEqual(["android", "web", "ios"]);
  });
});
